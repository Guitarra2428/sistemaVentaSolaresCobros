const { many } = require("../db/pool");
const m = require("./apiMappers");

async function search({ entidad, idEntidad, idUsuario, desde, hasta, limit = 100, offset = 0 } = {}) {
  const where = [];
  const params = [];
  const push = (clause, value) => { params.push(value); where.push(clause.replace("$?", `$${params.length}`)); };

  if (entidad) push("entidad_afectada = $?", entidad);
  if (idEntidad) push("id_entidad_afectada = $?", String(idEntidad));
  if (idUsuario) push("id_usuario = $?", Number(idUsuario));
  if (desde) push("fecha_hora >= $?", desde);
  if (hasta) push("fecha_hora <= $?", hasta);

  const lim = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const off = Math.max(Number(offset) || 0, 0);

  const sql = `SELECT a.*, u.nombre AS usuario_nombre
                 FROM auditoria a
                 LEFT JOIN usuarios u ON u.id_usuario = a.id_usuario
                ${where.length ? "WHERE " + where.join(" AND ") : ""}
                ORDER BY a.id_auditoria DESC
                LIMIT ${lim} OFFSET ${off}`;
  const rows = await many(sql, params);
  return rows.map(m.auditoria);
}

module.exports = { search };
