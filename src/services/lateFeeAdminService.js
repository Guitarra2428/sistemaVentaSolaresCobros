const { withTx } = require("../db/pool");
const m = require("./apiMappers");
const { audit } = require("./auditService");
const { currency } = require("../utils/format");
const { ValidationError, NotFoundError, ConflictError } = require("../errors");

/**
 * Ajusta el monto de una mora ya generada (spec §11.3).
 * Requiere motivo. Solo si la mora está Pendiente o Parcialmente pagada.
 */
async function ajustarMora(user, idMora, payload) {
  if (!payload.motivo || String(payload.motivo).trim().length < 3) {
    throw new ValidationError("Motivo obligatorio (mínimo 3 caracteres)");
  }
  const nuevoMonto = currency(Number(payload.nuevoMonto));
  if (!(nuevoMonto > 0)) throw new ValidationError("nuevoMonto debe ser mayor que 0");

  return withTx(async (client) => {
    const r = await client.query("SELECT * FROM mora WHERE id_mora = $1 FOR UPDATE", [idMora]);
    if (r.rowCount === 0) throw new NotFoundError("Mora no encontrada");
    const mora = r.rows[0];
    if (!["Pendiente", "Parcialmente pagada"].includes(mora.estado)) {
      throw new ConflictError(`No se puede ajustar una mora en estado ${mora.estado}`);
    }

    const pagos = await client.query(
      `SELECT COALESCE(SUM(dc.monto_aplicado), 0) AS pagado
         FROM detalle_cobro dc JOIN cobros co ON co.id_cobro = dc.id_cobro
        WHERE dc.id_mora = $1 AND co.estado = 'Registrado' AND dc.tipo_aplicacion = 'Mora'`,
      [idMora]
    );
    const yaPagado = Number(pagos.rows[0].pagado);
    if (nuevoMonto < yaPagado) {
      throw new ValidationError(`nuevoMonto (${nuevoMonto}) no puede ser menor al ya pagado (${yaPagado})`);
    }

    const { rows: [updated] } = await client.query(
      `UPDATE mora SET monto_mora = $1, fecha_modificacion = now(), id_usuario_modifica = $2
        WHERE id_mora = $3 RETURNING *`,
      [nuevoMonto, user.idUsuario, idMora]
    );

    // Refrescar estado según nuevo balance
    const bal = await client.query("SELECT balance_pendiente FROM v_balance_mora WHERE id_mora = $1", [idMora]);
    if (bal.rowCount) {
      let nuevoEstado = "Pendiente";
      if (Number(bal.rows[0].balance_pendiente) <= 0) nuevoEstado = "Pagada";
      else if (yaPagado > 0) nuevoEstado = "Parcialmente pagada";
      await client.query("UPDATE mora SET estado = $1 WHERE id_mora = $2", [nuevoEstado, idMora]);
    }

    await audit(client, user, "Ajustar mora", "mora", idMora, { antes: mora.monto_mora, despues: nuevoMonto, motivo: payload.motivo });
    return m.mora(updated);
  });
}

/**
 * Anula una mora. Solo si no tiene pagos aplicados o los pagos también se pueden gestionar
 * (por simplicidad v1.0: solo permite si no hay detalle_cobro asociado con tipo Mora en cobros
 * Registrados). Requiere motivo.
 */
async function anularMora(user, idMora, motivo) {
  if (!motivo || String(motivo).trim().length < 3) {
    throw new ValidationError("Motivo obligatorio (mínimo 3 caracteres)");
  }

  return withTx(async (client) => {
    const r = await client.query("SELECT * FROM mora WHERE id_mora = $1 FOR UPDATE", [idMora]);
    if (r.rowCount === 0) throw new NotFoundError("Mora no encontrada");
    const mora = r.rows[0];
    if (mora.estado === "Anulada") throw new ConflictError("La mora ya está anulada");

    const pagos = await client.query(
      `SELECT 1 FROM detalle_cobro dc JOIN cobros co ON co.id_cobro = dc.id_cobro
        WHERE dc.id_mora = $1 AND co.estado = 'Registrado' AND dc.tipo_aplicacion = 'Mora' LIMIT 1`,
      [idMora]
    );
    if (pagos.rowCount > 0) {
      throw new ConflictError("La mora tiene pagos aplicados; anule primero los cobros correspondientes");
    }

    await client.query(
      `UPDATE mora SET estado = 'Anulada', fecha_modificacion = now(), id_usuario_modifica = $2
        WHERE id_mora = $1`,
      [idMora, user.idUsuario]
    );

    // Refrescar estado del contrato asociado
    const contratoQ = await client.query(
      `SELECT c.id_contrato FROM cuotas c WHERE c.id_cuota = $1`,
      [mora.id_cuota]
    );
    if (contratoQ.rowCount) {
      const idContrato = contratoQ.rows[0].id_contrato;
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
    }

    await audit(client, user, "Anular mora", "mora", idMora, { motivo });
    return { ok: true, idMora, motivo };
  });
}

module.exports = { ajustarMora, anularMora };
