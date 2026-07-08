const { many, one } = require("../db/pool");

/**
 * Detalle de cliente: perfil + contratos con balance + cobros recientes +
 * moras activas + próxima cuota a vencer. Diseñado para el flujo del cajero
 * cuando busca a un cliente que llega a pagar.
 */
async function detalleCliente(idCliente) {
  const cliente = await one("SELECT * FROM clientes WHERE id_cliente = $1", [idCliente]);
  if (!cliente) return null;

  const contratos = await many(`
    SELECT ct.id_contrato, ct.numero_contrato, ct.estado AS estado_contrato,
           ct.fecha_contrato, ct.condiciones_pago,
           v.id_venta, v.precio_total, v.monto_inicial, v.monto_financiado,
           v.cantidad_cuotas, v.frecuencia_pago, v.fecha_venta, v.tasa_interes_cuota,
           s.manzana, s.numero_solar, s.estado AS estado_solar,
           p.nombre AS proyecto,
           u.nombre AS vendedor,
           COALESCE(bc.balance_pendiente, 0) AS balance_pendiente,
           COALESCE(bc.total_mora_pendiente, 0) AS mora_pendiente,
           EXISTS (SELECT 1 FROM renegociaciones r WHERE r.id_contrato = ct.id_contrato) AS es_renegociado
      FROM contratos ct
      JOIN ventas v ON v.id_venta = ct.id_venta
      JOIN solares s ON s.id_solar = v.id_solar
      JOIN proyectos p ON p.id_proyecto = s.id_proyecto
      LEFT JOIN usuarios u ON u.id_usuario = v.id_vendedor
      LEFT JOIN v_balance_contrato bc ON bc.id_contrato = ct.id_contrato
     WHERE v.id_cliente = $1
     ORDER BY ct.fecha_contrato DESC, ct.id_contrato DESC`, [idCliente]);

  const cobrosRecientes = await many(`
    SELECT co.id_cobro, co.numero_recibo, co.fecha_pago, co.monto_total,
           co.metodo_pago, co.estado, ct.numero_contrato,
           string_agg(dc.tipo_aplicacion, ', ') AS tipos_aplicacion
      FROM cobros co
      JOIN contratos ct ON ct.id_contrato = co.id_contrato
      LEFT JOIN detalle_cobro dc ON dc.id_cobro = co.id_cobro
     WHERE co.id_cliente = $1
     GROUP BY co.id_cobro, ct.numero_contrato
     ORDER BY co.fecha_pago DESC, co.id_cobro DESC
     LIMIT 15`, [idCliente]);

  const morasActivas = await many(`
    SELECT m.id_mora, m.dias_atraso, m.monto_mora, m.estado,
           bm.monto_pagado, bm.balance_pendiente,
           cu.numero_cuota, cu.fecha_vencimiento,
           ct.id_contrato, ct.numero_contrato
      FROM mora m
      JOIN v_balance_mora bm ON bm.id_mora = m.id_mora
      JOIN cuotas cu ON cu.id_cuota = m.id_cuota
      JOIN contratos ct ON ct.id_contrato = cu.id_contrato
      JOIN ventas v ON v.id_venta = ct.id_venta
     WHERE v.id_cliente = $1
       AND m.estado IN ('Pendiente','Parcialmente pagada')
     ORDER BY cu.fecha_vencimiento ASC`, [idCliente]);

  const proximaCuota = await one(`
    SELECT cu.id_cuota, cu.numero_cuota, cu.fecha_vencimiento, cu.monto,
           bc.balance_pendiente,
           ct.id_contrato, ct.numero_contrato
      FROM v_balance_cuota bc
      JOIN cuotas cu ON cu.id_cuota = bc.id_cuota
      JOIN contratos ct ON ct.id_contrato = cu.id_contrato
      JOIN ventas v ON v.id_venta = ct.id_venta
     WHERE v.id_cliente = $1
       AND cu.estado IN ('Pendiente','Parcialmente pagada','Vencida')
       AND bc.balance_pendiente > 0
     ORDER BY cu.fecha_vencimiento ASC
     LIMIT 1`, [idCliente]);

  const totales = contratos.reduce((acc, c) => {
    acc.contratosActivos += ["Activo", "En mora", "Pendiente de inicial"].includes(c.estado_contrato) ? 1 : 0;
    acc.balancePendiente += Number(c.balance_pendiente || 0);
    acc.moraPendiente += Number(c.mora_pendiente || 0);
    return acc;
  }, { contratosActivos: 0, balancePendiente: 0, moraPendiente: 0 });

  return { cliente, contratos, cobrosRecientes, morasActivas, proximaCuota, totales };
}

/**
 * Historial de un solar: reservas (todas), ventas (activas + anuladas),
 * auditoría relacionada. Útil para auditar qué pasó con un lote.
 */
async function historialSolar(idSolar) {
  const solar = await one(`
    SELECT s.*, p.nombre AS proyecto, p.id_proyecto,
           uc.nombre AS creado_por, um.nombre AS modificado_por
      FROM solares s
      JOIN proyectos p ON p.id_proyecto = s.id_proyecto
      LEFT JOIN usuarios uc ON uc.id_usuario = s.id_usuario_crea
      LEFT JOIN usuarios um ON um.id_usuario = s.id_usuario_modifica
     WHERE s.id_solar = $1`, [idSolar]);
  if (!solar) return null;

  const reservas = await many(`
    SELECT r.id_reserva, r.fecha_reserva, r.fecha_expiracion, r.estado,
           cl.nombre_completo AS cliente,
           u.nombre AS vendedor
      FROM reservas r
      JOIN clientes cl ON cl.id_cliente = r.id_cliente
      LEFT JOIN usuarios u ON u.id_usuario = r.id_vendedor
     WHERE r.id_solar = $1
     ORDER BY r.id_reserva DESC`, [idSolar]);

  const ventas = await many(`
    SELECT v.id_venta, v.fecha_venta, v.precio_total, v.monto_inicial,
           v.monto_financiado, v.cantidad_cuotas, v.estado AS estado_venta,
           cl.nombre_completo AS cliente,
           u.nombre AS vendedor,
           ct.id_contrato, ct.numero_contrato, ct.estado AS estado_contrato,
           bc.balance_pendiente
      FROM ventas v
      JOIN clientes cl ON cl.id_cliente = v.id_cliente
      LEFT JOIN usuarios u ON u.id_usuario = v.id_vendedor
      LEFT JOIN contratos ct ON ct.id_venta = v.id_venta
      LEFT JOIN v_balance_contrato bc ON bc.id_contrato = ct.id_contrato
     WHERE v.id_solar = $1
     ORDER BY v.id_venta DESC`, [idSolar]);

  const auditoria = await many(`
    SELECT a.accion, a.fecha_hora, u.nombre AS usuario
      FROM auditoria a
      LEFT JOIN usuarios u ON u.id_usuario = a.id_usuario
     WHERE a.entidad_afectada = 'solares' AND a.id_entidad_afectada = $1::text
     ORDER BY a.id_auditoria DESC
     LIMIT 30`, [String(idSolar)]);

  return { solar, reservas, ventas, auditoria };
}

/**
 * Detalle de recibo: cobro + cliente + contrato + detalles aplicados.
 * Diseñado para impresión.
 */
async function detalleRecibo(idCobro) {
  const cobro = await one(`
    SELECT co.*, cl.nombre_completo AS cliente_nombre,
           cl.cedula_rnc, cl.telefono, cl.direccion, cl.correo,
           ct.numero_contrato, ct.estado AS estado_contrato,
           v.id_solar, s.manzana, s.numero_solar, p.nombre AS proyecto,
           u.nombre AS cajero_nombre,
           ua.nombre AS anulado_por
      FROM cobros co
      JOIN clientes cl ON cl.id_cliente = co.id_cliente
      JOIN contratos ct ON ct.id_contrato = co.id_contrato
      JOIN ventas v ON v.id_venta = ct.id_venta
      JOIN solares s ON s.id_solar = v.id_solar
      JOIN proyectos p ON p.id_proyecto = s.id_proyecto
      JOIN usuarios u ON u.id_usuario = co.id_usuario
      LEFT JOIN usuarios ua ON ua.id_usuario = co.id_usuario_anula
     WHERE co.id_cobro = $1`, [idCobro]);
  if (!cobro) return null;

  const detalles = await many(`
    SELECT dc.id_detalle_cobro, dc.tipo_aplicacion, dc.monto_aplicado,
           cu.id_cuota, cu.numero_cuota, cu.fecha_vencimiento, cu.monto AS cuota_monto,
           m.id_mora, m.monto_mora
      FROM detalle_cobro dc
      LEFT JOIN cuotas cu ON cu.id_cuota = dc.id_cuota
      LEFT JOIN mora m ON m.id_mora = dc.id_mora
     WHERE dc.id_cobro = $1
     ORDER BY dc.id_detalle_cobro`, [idCobro]);

  const configEmpresa = await many(`
    SELECT clave, valor FROM configuracion
     WHERE clave IN ('moneda_default','simbolo_moneda','nombre_empresa','rnc_empresa','direccion_empresa','telefono_empresa','nota_legal_recibo')`);
  const config = Object.fromEntries(configEmpresa.map((r) => [r.clave, r.valor]));

  return { cobro, detalles, config };
}

module.exports = { detalleCliente, historialSolar, detalleRecibo };
