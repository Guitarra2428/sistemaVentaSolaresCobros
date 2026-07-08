const { withTx } = require("../db/pool");
const m = require("./apiMappers");
const { audit } = require("./auditService");
const { getNumber } = require("./configService");
const { addDays, today } = require("../utils/date");
const { currency } = require("../utils/format");
const { ValidationError, NotFoundError, ConflictError } = require("../errors");

async function findSolarForSale(client, idSolar) {
  const r = await client.query("SELECT * FROM solares WHERE id_solar = $1 FOR UPDATE", [idSolar]);
  if (r.rowCount === 0) throw new NotFoundError("Solar no encontrado");
  const solar = r.rows[0];
  if (!["Disponible", "Reservado"].includes(solar.estado)) {
    throw new ConflictError(`El solar no está disponible para venta (estado: ${solar.estado})`);
  }
  return solar;
}

async function findClienteExiste(client, idCliente) {
  const r = await client.query("SELECT 1 FROM clientes WHERE id_cliente = $1", [idCliente]);
  if (r.rowCount === 0) throw new NotFoundError("Cliente no encontrado");
}

function fechaCuotaN(fechaBase, index, frecuencia) {
  const dias = frecuencia === "Semanal" ? 7 : frecuencia === "Quincenal" ? 15 : 30;
  return addDays(fechaBase, index * dias);
}

async function createInstallments(client, idContrato, venta) {
  const capitalTotal = Number(venta.monto_financiado);
  const capitalBase = currency(capitalTotal / venta.cantidad_cuotas);
  const interestRate = Number(venta.tasa_interes_cuota);

  for (let i = 1; i <= venta.cantidad_cuotas; i++) {
    const capital = i === venta.cantidad_cuotas
      ? currency(capitalTotal - capitalBase * (venta.cantidad_cuotas - 1))
      : capitalBase;
    const interes = currency(capital * interestRate);
    const monto = currency(capital + interes);
    const vencimiento = fechaCuotaN(venta.fecha_primer_pago, i - 1, venta.frecuencia_pago);

    await client.query(
      `INSERT INTO cuotas (id_contrato, numero_cuota, fecha_vencimiento, monto, capital, interes, id_usuario_crea)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [idContrato, i, vencimiento, monto, capital, interes, venta.id_usuario_crea]
    );
  }
}

async function createSale(user, payload) {
  if (!payload.idCliente || !payload.idSolar) throw new ValidationError("Cliente y solar son obligatorios");
  const cantidadCuotas = Number(payload.cantidadCuotas);
  if (!Number.isInteger(cantidadCuotas) || cantidadCuotas <= 0) throw new ValidationError("Cantidad de cuotas inválida");
  const montoInicial = currency(Number(payload.montoInicial));
  if (!Number.isFinite(montoInicial) || montoInicial < 0) throw new ValidationError("Monto inicial inválido");

  return withTx(async (client) => {
    await findClienteExiste(client, payload.idCliente);
    const solar = await findSolarForSale(client, payload.idSolar);

    const precioTotal = currency(Number(payload.precioTotal || solar.precio_total));
    if (montoInicial > precioTotal) throw new ValidationError("El monto inicial no puede exceder el precio total");
    const montoFinanciado = currency(precioTotal - montoInicial);

    let reserva = null;
    if (payload.idReserva) {
      const r = await client.query("SELECT * FROM reservas WHERE id_reserva = $1 FOR UPDATE", [payload.idReserva]);
      if (r.rowCount === 0) throw new NotFoundError("Reserva no encontrada");
      if (r.rows[0].estado !== "Activa") throw new ConflictError("La reserva no está activa");
      reserva = r.rows[0];
    }

    const idVendedor = payload.idVendedor || user.idUsuario;
    const fechaVenta = payload.fechaVenta || today();
    const frecuencia = payload.frecuenciaPago || "Mensual";
    const fechaPrimerPago = payload.fechaPrimerPago || addDays(today(), 30);
    const montoCuotaRef = currency(montoFinanciado / cantidadCuotas);
    // Tasa: si el usuario especifica una en payload, se usa; si no, se toma la global de config.
    const tasaInteres = payload.tasaInteresCuota != null && payload.tasaInteresCuota !== ""
      ? Number(payload.tasaInteresCuota)
      : await getNumber("porcentaje_interes_cuota", 0.012);
    if (!(tasaInteres >= 0 && tasaInteres < 1)) throw new ValidationError("Tasa de interés inválida (debe estar entre 0 y 1)");

    const { rows: [venta] } = await client.query(
      `INSERT INTO ventas (id_cliente, id_solar, id_reserva, id_vendedor, fecha_venta,
                           precio_total, monto_inicial, monto_financiado, cantidad_cuotas, monto_cuota,
                           frecuencia_pago, fecha_primer_pago, tasa_interes_cuota, id_usuario_crea)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [payload.idCliente, payload.idSolar, reserva ? reserva.id_reserva : null, idVendedor, fechaVenta,
       precioTotal, montoInicial, montoFinanciado, cantidadCuotas, montoCuotaRef, frecuencia, fechaPrimerPago,
       tasaInteres, user.idUsuario]
    );

    // Bloquear solar
    await client.query(
      `UPDATE solares
          SET estado = 'Bloqueado', tipo_bloqueo = 'Venta pendiente de inicial',
              fecha_modificacion = now(), id_usuario_modifica = $2
        WHERE id_solar = $1`,
      [payload.idSolar, user.idUsuario]
    );

    // Cerrar reserva convertida
    if (reserva) {
      await client.query(
        `UPDATE reservas SET estado = 'Convertida en venta', fecha_modificacion = now(), id_usuario_modifica = $2
          WHERE id_reserva = $1`,
        [reserva.id_reserva, user.idUsuario]
      );
    }

    // Contrato (2 pasos: insert con placeholder único, luego update con numero derivado del id)
    const { rows: [contratoRaw] } = await client.query(
      `INSERT INTO contratos (numero_contrato, id_venta, fecha_contrato, condiciones_pago, estado, id_usuario_crea)
       VALUES ('TMP-' || substring(md5(random()::text || clock_timestamp()::text) for 20), $1, CURRENT_DATE, $2, 'Pendiente de inicial', $3)
       RETURNING *`,
      [venta.id_venta, payload.condicionesPago || "Plan generado automáticamente desde venta", user.idUsuario]
    );
    const numeroContrato = `CON-${new Date().getFullYear()}-${String(contratoRaw.id_contrato).padStart(5, "0")}`;
    const { rows: [contrato] } = await client.query(
      "UPDATE contratos SET numero_contrato = $1 WHERE id_contrato = $2 RETURNING *",
      [numeroContrato, contratoRaw.id_contrato]
    );

    // Plan de pago (cuotas preliminares — se marcan definitivas al cobrar inicial)
    await createInstallments(client, contrato.id_contrato, venta);

    // Comisión
    const porcentajeComision = await getNumber("porcentaje_comision_default", 0.03);
    const comisionIncluyeInicial = (await client.query(
      "SELECT valor FROM configuracion WHERE clave = 'comision_incluye_inicial'"
    )).rows[0]?.valor !== "false";
    const baseComision = comisionIncluyeInicial ? precioTotal : montoFinanciado;
    const montoComision = currency(baseComision * porcentajeComision);

    await client.query(
      `INSERT INTO comisiones (id_venta, id_vendedor, porcentaje_o_monto, base_incluye_inicial, monto_comision, id_usuario_crea)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [venta.id_venta, idVendedor, porcentajeComision, comisionIncluyeInicial, montoComision, user.idUsuario]
    );

    await audit(client, user, "Registrar venta y bloquear solar", "ventas", venta.id_venta,
      { venta, contrato });

    return { venta: m.venta(venta), contrato: m.contrato(contrato) };
  });
}

async function anularVenta(user, idVenta, motivo) {
  if (!motivo || String(motivo).trim().length < 3) throw new ValidationError("Motivo de anulación es obligatorio");

  return withTx(async (client) => {
    const v = await client.query("SELECT * FROM ventas WHERE id_venta = $1 FOR UPDATE", [idVenta]);
    if (v.rowCount === 0) throw new NotFoundError("Venta no encontrada");
    const venta = v.rows[0];

    const c = await client.query("SELECT * FROM contratos WHERE id_venta = $1 FOR UPDATE", [idVenta]);
    if (c.rowCount === 0) throw new ConflictError("La venta no tiene contrato asociado");
    const contrato = c.rows[0];

    if (contrato.estado !== "Pendiente de inicial") {
      throw new ConflictError("Solo se puede anular una venta antes del cobro del inicial");
    }

    // Anular contrato y cuotas
    await client.query("UPDATE contratos SET estado = 'Anulado', fecha_modificacion = now(), id_usuario_modifica = $2 WHERE id_contrato = $1",
      [contrato.id_contrato, user.idUsuario]);
    await client.query("UPDATE cuotas SET estado = 'Anulada', fecha_modificacion = now(), id_usuario_modifica = $2 WHERE id_contrato = $1",
      [contrato.id_contrato, user.idUsuario]);
    await client.query("UPDATE ventas SET estado = 'Anulada', fecha_modificacion = now(), id_usuario_modifica = $2 WHERE id_venta = $1",
      [idVenta, user.idUsuario]);
    await client.query("UPDATE comisiones SET estado = 'Pendiente' WHERE id_venta = $1", [idVenta]);

    // Liberar solar
    await client.query(
      `UPDATE solares SET estado = 'Disponible', tipo_bloqueo = NULL,
                          fecha_modificacion = now(), id_usuario_modifica = $2
        WHERE id_solar = $1`,
      [venta.id_solar, user.idUsuario]
    );

    await audit(client, user, "Anular venta y liberar solar", "ventas", idVenta, { motivo });
    return { ok: true, idVenta, idContrato: contrato.id_contrato, motivo };
  });
}

module.exports = { createSale, anularVenta };
