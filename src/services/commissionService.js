const { withTx, many } = require("../db/pool");
const m = require("./apiMappers");
const { audit } = require("./auditService");
const { ValidationError, NotFoundError, ConflictError } = require("../errors");
const { today } = require("../utils/date");

async function list(filters = {}) {
  const where = [];
  const params = [];
  if (filters.estado) { params.push(filters.estado); where.push(`c.estado = $${params.length}`); }
  if (filters.idVendedor) { params.push(Number(filters.idVendedor)); where.push(`c.id_vendedor = $${params.length}`); }
  const rows = await many(`
    SELECT c.*, u.nombre AS vendedor,
           v.precio_total, v.fecha_venta,
           cl.nombre_completo AS cliente
      FROM comisiones c
      JOIN usuarios u ON u.id_usuario = c.id_vendedor
      JOIN ventas v ON v.id_venta = c.id_venta
      JOIN clientes cl ON cl.id_cliente = v.id_cliente
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY c.id_comision DESC`, params);
  return rows.map((r) => ({
    ...m.comision(r),
    vendedor: r.vendedor,
    cliente: r.cliente,
    fechaVenta: r.fecha_venta ? String(r.fecha_venta).slice(0, 10) : null,
    precioVenta: Number(r.precio_total)
  }));
}

async function marcarPagada(user, idComision) {
  return withTx(async (client) => {
    const r = await client.query("SELECT * FROM comisiones WHERE id_comision = $1 FOR UPDATE", [idComision]);
    if (r.rowCount === 0) throw new NotFoundError("Comisión no encontrada");
    const comision = r.rows[0];
    if (comision.estado === "Pagada") throw new ConflictError("La comisión ya está pagada");

    const { rows: [updated] } = await client.query(
      `UPDATE comisiones
          SET estado = 'Pagada',
              fecha_pago = $2,
              id_usuario_paga = $3,
              fecha_modificacion = now(),
              id_usuario_modifica = $3
        WHERE id_comision = $1 RETURNING *`,
      [idComision, today(), user.idUsuario]
    );
    await audit(client, user, "Marcar comisión pagada", "comisiones", idComision,
      { monto: comision.monto_comision, vendedor: comision.id_vendedor });
    return m.comision(updated);
  });
}

module.exports = { list, marcarPagada };
