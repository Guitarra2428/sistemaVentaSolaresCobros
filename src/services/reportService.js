const { many, one } = require("../db/pool");

function buildRange(filters) {
  const where = [];
  const params = [];
  if (filters.desde) { params.push(filters.desde); where.push(`$${params.length}::date <= __COL__`); }
  if (filters.hasta) { params.push(filters.hasta); where.push(`__COL__ <= $${params.length}::date`); }
  return { where, params };
}

async function reporteVentas(filters = {}) {
  const params = [];
  const where = [];
  if (filters.desde) { params.push(filters.desde); where.push(`v.fecha_venta >= $${params.length}::date`); }
  if (filters.hasta) { params.push(filters.hasta); where.push(`v.fecha_venta <= $${params.length}::date`); }
  if (filters.idVendedor) { params.push(Number(filters.idVendedor)); where.push(`v.id_vendedor = $${params.length}`); }
  if (filters.estado) { params.push(filters.estado); where.push(`v.estado = $${params.length}`); }

  const rows = await many(`
    SELECT v.id_venta, v.fecha_venta, v.precio_total, v.monto_inicial, v.monto_financiado,
           v.cantidad_cuotas, v.estado, v.id_cliente, cl.nombre_completo AS cliente,
           v.id_solar, s.manzana, s.numero_solar,
           v.id_vendedor, u.nombre AS vendedor,
           ct.id_contrato, ct.numero_contrato, ct.estado AS estado_contrato,
           bc.balance_pendiente
      FROM ventas v
      LEFT JOIN clientes cl ON cl.id_cliente = v.id_cliente
      LEFT JOIN solares s ON s.id_solar = v.id_solar
      LEFT JOIN usuarios u ON u.id_usuario = v.id_vendedor
      LEFT JOIN contratos ct ON ct.id_venta = v.id_venta
      LEFT JOIN v_balance_contrato bc ON bc.id_contrato = ct.id_contrato
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY v.fecha_venta DESC, v.id_venta DESC`, params);

  const totales = rows.reduce((acc, r) => {
    acc.precioTotal += Number(r.precio_total || 0);
    acc.montoInicial += Number(r.monto_inicial || 0);
    acc.montoFinanciado += Number(r.monto_financiado || 0);
    return acc;
  }, { precioTotal: 0, montoInicial: 0, montoFinanciado: 0 });

  return { count: rows.length, totales, items: rows };
}

async function reporteCobros(filters = {}) {
  const params = [];
  const where = ["co.estado = 'Registrado'"];
  if (filters.desde) { params.push(filters.desde); where.push(`co.fecha_pago >= $${params.length}::date`); }
  if (filters.hasta) { params.push(filters.hasta); where.push(`co.fecha_pago <= $${params.length}::date`); }
  if (filters.idUsuario) { params.push(Number(filters.idUsuario)); where.push(`co.id_usuario = $${params.length}`); }
  if (filters.tipoAplicacion) { params.push(filters.tipoAplicacion); where.push(`dc.tipo_aplicacion = $${params.length}`); }

  const rows = await many(`
    SELECT co.id_cobro, co.numero_recibo, co.fecha_pago, co.monto_total,
           co.metodo_pago, co.modalidad_aplicacion, co.estado,
           dc.tipo_aplicacion, dc.monto_aplicado,
           co.id_cliente, cl.nombre_completo AS cliente,
           co.id_contrato, ct.numero_contrato,
           co.id_usuario, u.nombre AS cajero
      FROM cobros co
      JOIN detalle_cobro dc ON dc.id_cobro = co.id_cobro
      LEFT JOIN clientes cl ON cl.id_cliente = co.id_cliente
      LEFT JOIN contratos ct ON ct.id_contrato = co.id_contrato
      LEFT JOIN usuarios u ON u.id_usuario = co.id_usuario
      WHERE ${where.join(" AND ")}
      ORDER BY co.fecha_pago DESC, co.id_cobro DESC`, params);

  const totales = rows.reduce((acc, r) => {
    const t = r.tipo_aplicacion;
    acc.total += Number(r.monto_aplicado || 0);
    acc.porTipo[t] = (acc.porTipo[t] || 0) + Number(r.monto_aplicado || 0);
    return acc;
  }, { total: 0, porTipo: {} });

  return { count: rows.length, totales, items: rows };
}

async function reporteMora(filters = {}) {
  const params = [];
  const where = ["m.estado IN ('Pendiente','Parcialmente pagada')"];
  if (filters.idContrato) { params.push(Number(filters.idContrato)); where.push(`ct.id_contrato = $${params.length}`); }
  if (filters.idCliente) { params.push(Number(filters.idCliente)); where.push(`v.id_cliente = $${params.length}`); }

  const rows = await many(`
    SELECT m.id_mora, m.dias_atraso, m.monto_mora, m.estado,
           bm.monto_pagado, bm.balance_pendiente,
           m.id_cuota, cu.numero_cuota, cu.fecha_vencimiento,
           ct.id_contrato, ct.numero_contrato,
           v.id_cliente, cl.nombre_completo AS cliente
      FROM mora m
      JOIN v_balance_mora bm ON bm.id_mora = m.id_mora
      JOIN cuotas cu ON cu.id_cuota = m.id_cuota
      JOIN contratos ct ON ct.id_contrato = cu.id_contrato
      JOIN ventas v ON v.id_venta = ct.id_venta
      LEFT JOIN clientes cl ON cl.id_cliente = v.id_cliente
      WHERE ${where.join(" AND ")}
      ORDER BY cu.fecha_vencimiento ASC`, params);

  const totales = rows.reduce((acc, r) => {
    acc.montoMoraTotal += Number(r.monto_mora || 0);
    acc.pagadoTotal += Number(r.monto_pagado || 0);
    acc.pendienteTotal += Number(r.balance_pendiente || 0);
    return acc;
  }, { montoMoraTotal: 0, pagadoTotal: 0, pendienteTotal: 0 });

  return { count: rows.length, totales, items: rows };
}

async function reporteComisiones(filters = {}) {
  const params = [];
  const where = [];
  if (filters.idVendedor) { params.push(Number(filters.idVendedor)); where.push(`c.id_vendedor = $${params.length}`); }
  if (filters.estado) { params.push(filters.estado); where.push(`c.estado = $${params.length}`); }
  if (filters.desde) { params.push(filters.desde); where.push(`c.fecha_generacion >= $${params.length}::date`); }
  if (filters.hasta) { params.push(filters.hasta); where.push(`c.fecha_generacion <= $${params.length}::date`); }

  const rows = await many(`
    SELECT c.id_comision, c.monto_comision, c.porcentaje_o_monto, c.estado,
           c.fecha_generacion, c.fecha_pago,
           c.id_venta, v.precio_total,
           c.id_vendedor, u.nombre AS vendedor
      FROM comisiones c
      JOIN ventas v ON v.id_venta = c.id_venta
      JOIN usuarios u ON u.id_usuario = c.id_vendedor
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY c.fecha_generacion DESC, c.id_comision DESC`, params);

  const totales = rows.reduce((acc, r) => {
    if (r.estado === "Pagada") acc.pagado += Number(r.monto_comision || 0);
    else acc.pendiente += Number(r.monto_comision || 0);
    return acc;
  }, { pagado: 0, pendiente: 0 });

  return { count: rows.length, totales, items: rows };
}

async function reporteSolares(filters = {}) {
  const params = [];
  const where = [];
  if (filters.estado) { params.push(filters.estado); where.push(`s.estado = $${params.length}`); }
  if (filters.idProyecto) { params.push(Number(filters.idProyecto)); where.push(`s.id_proyecto = $${params.length}`); }

  const rows = await many(`
    SELECT s.id_solar, s.manzana, s.numero_solar, s.metros_cuadrados,
           s.precio_por_metro, s.precio_total, s.estado, s.tipo_bloqueo,
           p.id_proyecto, p.nombre AS proyecto
      FROM solares s
      JOIN proyectos p ON p.id_proyecto = s.id_proyecto
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY p.nombre, s.manzana, s.numero_solar`, params);

  const porEstado = rows.reduce((acc, r) => {
    acc[r.estado] = (acc[r.estado] || 0) + 1;
    return acc;
  }, {});

  return { count: rows.length, porEstado, items: rows };
}

async function estadoCuenta(idContrato) {
  const contrato = await one(`
    SELECT ct.*, v.id_cliente, v.id_solar, v.monto_inicial, v.monto_financiado,
           v.precio_total, v.cantidad_cuotas, v.fecha_venta, v.tasa_interes_cuota,
           cl.nombre_completo AS cliente, cl.cedula_rnc,
           s.manzana, s.numero_solar,
           bc.balance_pendiente, bc.inicial_pendiente, bc.total_cuotas_pagado, bc.total_mora_pendiente
      FROM contratos ct
      JOIN ventas v ON v.id_venta = ct.id_venta
      JOIN clientes cl ON cl.id_cliente = v.id_cliente
      JOIN solares s ON s.id_solar = v.id_solar
      LEFT JOIN v_balance_contrato bc ON bc.id_contrato = ct.id_contrato
     WHERE ct.id_contrato = $1`, [idContrato]);
  if (!contrato) return null;

  const cuotas = await many(`
    SELECT cu.*, bc.monto_pagado, bc.balance_pendiente
      FROM cuotas cu
      JOIN v_balance_cuota bc ON bc.id_cuota = cu.id_cuota
     WHERE cu.id_contrato = $1
     ORDER BY cu.numero_cuota`, [idContrato]);

  const mora = await many(`
    SELECT m.*, bm.monto_pagado, bm.balance_pendiente, cu.numero_cuota, cu.fecha_vencimiento
      FROM mora m
      JOIN v_balance_mora bm ON bm.id_mora = m.id_mora
      JOIN cuotas cu ON cu.id_cuota = m.id_cuota
     WHERE cu.id_contrato = $1
     ORDER BY m.id_mora`, [idContrato]);

  const cobros = await many(`
    SELECT co.id_cobro, co.numero_recibo, co.fecha_pago, co.monto_total,
           co.metodo_pago, co.modalidad_aplicacion, co.estado,
           dc.tipo_aplicacion, dc.monto_aplicado
      FROM cobros co
      JOIN detalle_cobro dc ON dc.id_cobro = co.id_cobro
     WHERE co.id_contrato = $1
     ORDER BY co.fecha_pago DESC, co.id_cobro DESC`, [idContrato]);

  const renegs = await many(
    "SELECT * FROM renegociaciones WHERE id_contrato = $1 ORDER BY fecha DESC",
    [idContrato]
  );

  return { contrato, cuotas, mora, cobros, renegociaciones: renegs };
}

module.exports = {
  reporteVentas, reporteCobros, reporteMora, reporteComisiones,
  reporteSolares, estadoCuenta
};
