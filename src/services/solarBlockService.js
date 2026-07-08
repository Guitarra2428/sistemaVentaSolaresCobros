const { withTx } = require("../db/pool");
const m = require("./apiMappers");
const { audit } = require("./auditService");
const { ValidationError, NotFoundError, ConflictError } = require("../errors");

const TIPOS_MANUALES = ["Administrativo", "Legal", "Otro"];

async function bloquear(user, idSolar, payload) {
  const tipo = payload.tipoBloqueo;
  const motivo = String(payload.motivo || "").trim();
  if (!TIPOS_MANUALES.includes(tipo)) {
    throw new ValidationError(`tipoBloqueo debe ser uno de: ${TIPOS_MANUALES.join(", ")}`);
  }
  if (motivo.length < 3) throw new ValidationError("Motivo obligatorio (mínimo 3 caracteres)");

  return withTx(async (client) => {
    const r = await client.query("SELECT * FROM solares WHERE id_solar = $1 FOR UPDATE", [idSolar]);
    if (r.rowCount === 0) throw new NotFoundError("Solar no encontrado");
    const solar = r.rows[0];
    if (!["Disponible", "Reservado"].includes(solar.estado)) {
      throw new ConflictError(`No se puede bloquear un solar en estado ${solar.estado}. Solo Disponible o Reservado.`);
    }
    const observacionesNew = [solar.observaciones, `[BLOQUEO ${tipo}]: ${motivo}`].filter(Boolean).join(" | ");
    const { rows: [updated] } = await client.query(
      `UPDATE solares
          SET estado = 'Bloqueado', tipo_bloqueo = $2,
              observaciones = $3,
              fecha_modificacion = now(), id_usuario_modifica = $4
        WHERE id_solar = $1 RETURNING *`,
      [idSolar, tipo, observacionesNew, user.idUsuario]
    );
    await audit(client, user, "Bloquear solar", "solares", idSolar, { tipo, motivo, estado_anterior: solar.estado });
    return m.solar(updated);
  });
}

async function desbloquear(user, idSolar, motivo) {
  if (!motivo || String(motivo).trim().length < 3) throw new ValidationError("Motivo obligatorio (mínimo 3 caracteres)");
  return withTx(async (client) => {
    const r = await client.query("SELECT * FROM solares WHERE id_solar = $1 FOR UPDATE", [idSolar]);
    if (r.rowCount === 0) throw new NotFoundError("Solar no encontrado");
    const solar = r.rows[0];
    if (solar.estado !== "Bloqueado") throw new ConflictError("El solar no está bloqueado");
    if (solar.tipo_bloqueo === "Venta pendiente de inicial") {
      throw new ConflictError("Este bloqueo es automático por venta pendiente; anula la venta para liberar el solar");
    }
    const { rows: [updated] } = await client.query(
      `UPDATE solares
          SET estado = 'Disponible', tipo_bloqueo = NULL,
              fecha_modificacion = now(), id_usuario_modifica = $2
        WHERE id_solar = $1 RETURNING *`,
      [idSolar, user.idUsuario]
    );
    await audit(client, user, "Desbloquear solar", "solares", idSolar, { tipo_anterior: solar.tipo_bloqueo, motivo });
    return m.solar(updated);
  });
}

module.exports = { bloquear, desbloquear, TIPOS_MANUALES };
