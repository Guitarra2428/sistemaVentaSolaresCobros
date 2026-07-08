const { many, one } = require("../db/pool");
const m = require("./apiMappers");

// Vistas: v_balance_cuota, v_balance_mora, v_balance_contrato (migración 002).

async function balanceContrato(idContrato) {
  const row = await one("SELECT * FROM v_balance_contrato WHERE id_contrato = $1", [idContrato]);
  return row;
}

async function cuotasConBalance(idContrato) {
  const rows = await many("SELECT * FROM v_balance_cuota WHERE id_contrato = $1 ORDER BY numero_cuota", [idContrato]);
  return rows;
}

async function moraConBalance(idContrato) {
  return many(
    `SELECT bm.* FROM v_balance_mora bm
       JOIN cuotas c ON c.id_cuota = bm.id_cuota
      WHERE c.id_contrato = $1 ORDER BY bm.id_mora`,
    [idContrato]
  );
}

async function contratosRenegociadosSet() {
  const rows = await many("SELECT id_contrato FROM v_contratos_renegociados");
  return new Set(rows.map((r) => r.id_contrato));
}

/**
 * Foto completa del estado del sistema para el endpoint /api/bootstrap.
 * Devuelve el estado en la forma exacta que consume public/app.js.
 */
async function snapshotGlobal() {
  const [
    clientes, proyectos, solares, reservas, ventas, contratos, cuotas, mora,
    cobros, detalle, renegs, comisiones, usuarios, roles, auditoria,
    balancesContrato, balancesCuota, balancesMora, configRows, permisosPorRol
  ] = await Promise.all([
    many("SELECT * FROM clientes ORDER BY id_cliente"),
    many("SELECT * FROM proyectos ORDER BY id_proyecto"),
    many("SELECT * FROM solares ORDER BY id_solar"),
    many("SELECT * FROM reservas ORDER BY id_reserva DESC"),
    many("SELECT * FROM ventas ORDER BY id_venta DESC"),
    many("SELECT * FROM contratos ORDER BY id_contrato DESC"),
    many("SELECT * FROM cuotas ORDER BY id_contrato, numero_cuota"),
    many("SELECT * FROM mora ORDER BY id_mora DESC"),
    many("SELECT * FROM cobros ORDER BY id_cobro DESC"),
    many("SELECT * FROM detalle_cobro ORDER BY id_detalle_cobro"),
    many("SELECT * FROM renegociaciones ORDER BY id_renegociacion DESC"),
    many("SELECT * FROM comisiones ORDER BY id_comision DESC"),
    many(`SELECT u.id_usuario, u.nombre, u.correo, u.nombre_acceso, u.estado, r.nombre_rol
            FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol ORDER BY u.id_usuario`),
    many("SELECT * FROM roles ORDER BY id_rol"),
    many(`SELECT a.*, u.nombre AS usuario_nombre FROM auditoria a
            LEFT JOIN usuarios u ON u.id_usuario = a.id_usuario
           ORDER BY a.id_auditoria DESC LIMIT 200`),
    many("SELECT * FROM v_balance_contrato"),
    many("SELECT * FROM v_balance_cuota"),
    many("SELECT * FROM v_balance_mora"),
    many("SELECT clave, valor FROM configuracion WHERE estado = 'Activo'"),
    many("SELECT id_rol, funcion FROM permisos_rol WHERE permitido = true")
  ]);

  const renegSet = await contratosRenegociadosSet();
  const balByContract = new Map(balancesContrato.map((b) => [b.id_contrato, b]));
  const balByCuota = new Map(balancesCuota.map((b) => [b.id_cuota, b]));
  const balByMora = new Map(balancesMora.map((b) => [b.id_mora, b]));

  const permisosMap = new Map();
  for (const p of permisosPorRol) {
    if (!permisosMap.has(p.id_rol)) permisosMap.set(p.id_rol, []);
    permisosMap.get(p.id_rol).push(p.funcion);
  }

  const configKV = Object.fromEntries(configRows.map((r) => [r.clave, r.valor]));

  return {
    clientes: clientes.map(m.cliente),
    proyectos: proyectos.map(m.proyecto),
    solares: solares.map(m.solar),
    reservas: reservas.map(m.reserva),
    ventas: ventas.map(m.venta),
    contratos: contratos.map((c) => {
      const bal = balByContract.get(c.id_contrato);
      return m.contrato(c, { balance: bal ? bal.balance_pendiente : 0, esRenegociado: renegSet.has(c.id_contrato) });
    }),
    cuotas: cuotas.map((c) => m.cuota(c, balByCuota.get(c.id_cuota))),
    mora: mora.map((mo) => m.mora(mo, balByMora.get(mo.id_mora))),
    cobros: cobros.map(m.cobro),
    detalleCobro: detalle.map(m.detalleCobro),
    renegociaciones: renegs.map(m.renegociacion),
    comisiones: comisiones.map(m.comision),
    usuarios: usuarios.map(m.usuario),
    roles: roles.map((r) => m.rol(r, permisosMap.get(r.id_rol) || [])),
    auditoria: auditoria.map(m.auditoria),
    configuracion: m.configuracion(configKV)
  };
}

module.exports = { balanceContrato, cuotasConBalance, moraConBalance, snapshotGlobal };
