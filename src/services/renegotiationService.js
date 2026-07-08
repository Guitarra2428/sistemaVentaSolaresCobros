const { withTx } = require("../db/pool");
const m = require("./apiMappers");
const { audit } = require("./auditService");
const { addDays } = require("../utils/date");
const { currency } = require("../utils/format");
const { ValidationError, NotFoundError, ConflictError } = require("../errors");

/**
 * Renegociación formal (spec §6.8).
 *
 * Recalcula el plan de pago del contrato:
 *  - Anula todas las cuotas Pendientes/Parcialmente pagadas (deja las Pagadas intactas).
 *  - Toma el balance pendiente del contrato como nuevo capital a distribuir.
 *  - Genera N cuotas nuevas con la frecuencia indicada.
 *  - Deja registro en `renegociaciones` con condiciones anteriores y nuevas.
 *
 * No modifica moras existentes (se paga o anula por su propio endpoint).
 */
async function renegotiate(user, payload) {
  const {
    idContrato,
    motivo,
    cantidadCuotas,
    frecuenciaPago = "Mensual",
    fechaPrimerPago
  } = payload;

  if (!idContrato) throw new ValidationError("idContrato es obligatorio");
  if (!motivo || String(motivo).trim().length < 3) throw new ValidationError("Motivo obligatorio (mínimo 3 caracteres)");
  const nCuotas = Number(cantidadCuotas);
  if (!Number.isInteger(nCuotas) || nCuotas <= 0) throw new ValidationError("cantidadCuotas inválida");
  if (!fechaPrimerPago) throw new ValidationError("fechaPrimerPago obligatoria");

  return withTx(async (client) => {
    const cr = await client.query("SELECT * FROM contratos WHERE id_contrato = $1 FOR UPDATE", [idContrato]);
    if (cr.rowCount === 0) throw new NotFoundError("Contrato no encontrado");
    const contrato = cr.rows[0];
    if (!["Activo", "En mora"].includes(contrato.estado)) {
      throw new ConflictError(`No se puede renegociar un contrato en estado ${contrato.estado}`);
    }

    const vr = await client.query("SELECT * FROM ventas WHERE id_venta = $1 FOR UPDATE", [contrato.id_venta]);
    const venta = vr.rows[0];

    // Balance actual del contrato (solo cuotas pendientes)
    const balRow = await client.query(
      `SELECT COALESCE(SUM(bc.balance_pendiente), 0) AS saldo,
              COUNT(*) FILTER (WHERE bc.balance_pendiente > 0) AS cuotas_pendientes
         FROM v_balance_cuota bc
        WHERE bc.id_contrato = $1
          AND bc.estado NOT IN ('Anulada')`,
      [idContrato]
    );
    const saldo = currency(Number(balRow.rows[0].saldo));
    if (!(saldo > 0)) throw new ConflictError("El contrato no tiene saldo pendiente para renegociar");

    // Snapshot de condiciones anteriores
    const cuotasAnt = await client.query(
      "SELECT numero_cuota, monto, capital, interes, estado FROM cuotas WHERE id_contrato = $1 ORDER BY numero_cuota",
      [idContrato]
    );
    const condAnteriores = {
      montoFinanciado: Number(venta.monto_financiado),
      cantidadCuotas: venta.cantidad_cuotas,
      frecuenciaPago: venta.frecuencia_pago,
      fechaPrimerPago: venta.fecha_primer_pago,
      cuotas: cuotasAnt.rows,
      saldoAlMomento: saldo
    };

    // Anular cuotas pendientes/parcialmente pagadas
    await client.query(
      `UPDATE cuotas SET estado = 'Anulada', fecha_modificacion = now(), id_usuario_modifica = $2
        WHERE id_contrato = $1 AND estado IN ('Pendiente','Parcialmente pagada','Vencida')`,
      [idContrato, user.idUsuario]
    );

    // Nuevo plan — reusa la tasa original del contrato (venta.tasa_interes_cuota)
    const capitalBase = currency(saldo / nCuotas);
    const interestRate = Number(venta.tasa_interes_cuota);
    const diasFrecuencia = frecuenciaPago === "Semanal" ? 7 : frecuenciaPago === "Quincenal" ? 15 : 30;

    const nuevasCuotas = [];
    // Determinar el próximo número de cuota (para no repetir contra las anuladas)
    const maxRow = await client.query(
      "SELECT COALESCE(MAX(numero_cuota), 0) AS mx FROM cuotas WHERE id_contrato = $1",
      [idContrato]
    );
    let numero = maxRow.rows[0].mx;

    for (let i = 1; i <= nCuotas; i++) {
      numero++;
      const capital = i === nCuotas
        ? currency(saldo - capitalBase * (nCuotas - 1))
        : capitalBase;
      const interes = currency(capital * interestRate);
      const monto = currency(capital + interes);
      const venc = addDays(fechaPrimerPago, (i - 1) * diasFrecuencia);
      const { rows: [row] } = await client.query(
        `INSERT INTO cuotas (id_contrato, numero_cuota, fecha_vencimiento, monto, capital, interes, id_usuario_crea)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [idContrato, numero, venc, monto, capital, interes, user.idUsuario]
      );
      nuevasCuotas.push(row);
    }

    // Nota: NO se actualizan campos históricos de `ventas` (precio_total, monto_inicial,
    // monto_financiado, cantidad_cuotas, frecuencia_pago, fecha_primer_pago). Esos registran
    // los términos originales del contrato. La renegociación se refleja en el nuevo plan
    // de cuotas + la fila de `renegociaciones` con condiciones anteriores/nuevas.
    // El balance vigente se calcula dinámicamente en v_balance_contrato desde las cuotas.
    await client.query(
      "UPDATE ventas SET fecha_modificacion = now(), id_usuario_modifica = $1 WHERE id_venta = $2",
      [user.idUsuario, venta.id_venta]
    );

    const condNuevas = {
      saldoRenegociado: saldo,
      cantidadCuotas: nCuotas,
      frecuenciaPago,
      fechaPrimerPago,
      cuotasGeneradas: nuevasCuotas.length
    };

    const { rows: [renegRow] } = await client.query(
      `INSERT INTO renegociaciones (id_contrato, id_cobro_origen, motivo,
                                    condiciones_anteriores, condiciones_nuevas,
                                    id_usuario_autoriza, id_usuario_crea)
       VALUES ($1, NULL, $2, $3::jsonb, $4::jsonb, $5, $5) RETURNING *`,
      [idContrato, motivo, JSON.stringify(condAnteriores), JSON.stringify(condNuevas), user.idUsuario]
    );

    // Si el contrato estaba en mora pero no queda mora activa, refrescamos
    const moraViva = await client.query(
      `SELECT 1 FROM mora m JOIN cuotas c ON c.id_cuota = m.id_cuota
        WHERE c.id_contrato = $1 AND m.estado IN ('Pendiente','Parcialmente pagada') LIMIT 1`,
      [idContrato]
    );
    if (moraViva.rowCount === 0) {
      await client.query(
        "UPDATE contratos SET estado = 'Activo', fecha_modificacion = now() WHERE id_contrato = $1 AND estado = 'En mora'",
        [idContrato]
      );
    }

    await audit(client, user, "Renegociar contrato", "renegociaciones", renegRow.id_renegociacion, {
      contrato: idContrato, condAnteriores, condNuevas
    });

    return m.renegociacion(renegRow);
  });
}

module.exports = { renegotiate };
