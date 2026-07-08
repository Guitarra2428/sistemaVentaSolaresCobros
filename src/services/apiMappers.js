// Mapea filas SQL (snake_case, ids largos) a la forma que consume el frontend
// (`.id` corto por entidad, camelCase). Reduce churn en public/app.js.

const { currency } = require("../utils/format");

function isoDate(v) {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function toDateOnly(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") return v.slice(0, 10);
  return String(v);
}

function cliente(r) {
  if (!r) return null;
  return {
    id: r.id_cliente,
    codigo: `CLI-${String(r.id_cliente).padStart(3, "0")}`,
    nombre: r.nombre_completo,
    cedulaRnc: r.cedula_rnc,
    telefono: r.telefono || "",
    correo: r.correo || "",
    direccion: r.direccion || "",
    fechaNacimiento: toDateOnly(r.fecha_nacimiento),
    estadoCivil: r.estado_civil || "",
    ocupacion: r.ocupacion || "",
    estado: r.estado,
    creado: isoDate(r.fecha_creacion)
  };
}

function proyecto(r) {
  if (!r) return null;
  return {
    id: r.id_proyecto,
    codigo: `PRJ-${String(r.id_proyecto).padStart(3, "0")}`,
    nombre: r.nombre,
    ubicacion: r.ubicacion || "",
    descripcion: r.descripcion || "",
    cantidadSolares: r.cantidad_solares || 0,
    estado: r.estado,
    creado: isoDate(r.fecha_creacion)
  };
}

function solar(r) {
  if (!r) return null;
  return {
    id: r.id_solar,
    codigo: `${r.manzana}-${r.numero_solar}`,
    proyectoId: r.id_proyecto,
    manzana: r.manzana,
    numero: r.numero_solar,
    metros: Number(r.metros_cuadrados),
    precioMetro: Number(r.precio_por_metro),
    precioTotal: Number(r.precio_total),
    estado: r.estado,
    tipoBloqueo: r.tipo_bloqueo,
    ubicacionRef: r.ubicacion_ref || "",
    observaciones: r.observaciones || "",
    creado: isoDate(r.fecha_creacion)
  };
}

function reserva(r) {
  if (!r) return null;
  return {
    id: r.id_reserva,
    solarId: r.id_solar,
    clienteId: r.id_cliente,
    vendedorId: r.id_vendedor,
    fechaReserva: toDateOnly(r.fecha_reserva),
    fechaExpiracion: toDateOnly(r.fecha_expiracion),
    estado: r.estado,
    creado: isoDate(r.fecha_creacion)
  };
}

function venta(r) {
  if (!r) return null;
  return {
    id: r.id_venta,
    numero: `VEN-${String(r.id_venta).padStart(6, "0")}`,
    clienteId: r.id_cliente,
    solarId: r.id_solar,
    reservaId: r.id_reserva,
    vendedorId: r.id_vendedor,
    fechaVenta: toDateOnly(r.fecha_venta),
    precioTotal: Number(r.precio_total),
    montoInicial: Number(r.monto_inicial),
    montoFinanciado: Number(r.monto_financiado),
    cantidadCuotas: r.cantidad_cuotas,
    montoCuota: r.monto_cuota != null ? Number(r.monto_cuota) : null,
    frecuenciaPago: r.frecuencia_pago,
    fechaPrimerPago: toDateOnly(r.fecha_primer_pago),
    tasaInteresCuota: r.tasa_interes_cuota != null ? Number(r.tasa_interes_cuota) : null,
    estado: r.estado,
    creado: isoDate(r.fecha_creacion)
  };
}

function contrato(r, extras = {}) {
  if (!r) return null;
  return {
    id: r.id_contrato,
    numero: r.numero_contrato,
    ventaId: r.id_venta,
    fechaContrato: toDateOnly(r.fecha_contrato),
    condicionesPago: r.condiciones_pago || "",
    estado: r.estado,
    balance: extras.balance != null ? Number(extras.balance) : 0,
    esRenegociado: !!extras.esRenegociado,
    creado: isoDate(r.fecha_creacion)
  };
}

function cuota(r, balanceRow) {
  if (!r) return null;
  const pagado = balanceRow ? Number(balanceRow.monto_pagado || 0) : 0;
  const pendiente = balanceRow ? Number(balanceRow.balance_pendiente || 0) : Number(r.monto);
  return {
    id: r.id_cuota,
    contratoId: r.id_contrato,
    numero: r.numero_cuota,
    fechaVencimiento: toDateOnly(r.fecha_vencimiento),
    monto: Number(r.monto),
    capital: Number(r.capital),
    interes: Number(r.interes),
    estado: r.estado,
    montoPagado: currency(pagado),
    balancePendiente: currency(pendiente)
  };
}

function mora(r, balanceRow) {
  if (!r) return null;
  const pagado = balanceRow ? Number(balanceRow.monto_pagado || 0) : 0;
  const pendiente = balanceRow ? Number(balanceRow.balance_pendiente || 0) : Number(r.monto_mora);
  return {
    id: r.id_mora,
    cuotaId: r.id_cuota,
    fechaInicioMora: toDateOnly(r.fecha_inicio_mora),
    diasAtraso: r.dias_atraso,
    porcentajeMora: Number(r.porcentaje_mora),
    balanceBaseCalculo: Number(r.balance_base_calculo),
    montoMora: Number(r.monto_mora),
    estado: r.estado,
    montoPagado: currency(pagado),
    balancePendiente: currency(pendiente),
    fechaCalculo: isoDate(r.fecha_calculo)
  };
}

function cobro(r) {
  if (!r) return null;
  return {
    id: r.id_cobro,
    numero: r.numero_recibo,
    clienteId: r.id_cliente,
    contratoId: r.id_contrato,
    usuarioId: r.id_usuario,
    fechaPago: toDateOnly(r.fecha_pago),
    montoTotal: Number(r.monto_total),
    metodoPago: r.metodo_pago,
    referenciaPago: r.referencia_pago || "",
    modalidadAplicacion: r.modalidad_aplicacion,
    estado: r.estado,
    motivoAnulacion: r.motivo_anulacion,
    fechaAnulacion: isoDate(r.fecha_anulacion),
    creado: isoDate(r.fecha_creacion)
  };
}

function detalleCobro(r) {
  if (!r) return null;
  return {
    id: r.id_detalle_cobro,
    cobroId: r.id_cobro,
    cuotaId: r.id_cuota,
    moraId: r.id_mora,
    tipoAplicacion: r.tipo_aplicacion,
    montoAplicado: Number(r.monto_aplicado)
  };
}

function renegociacion(r) {
  if (!r) return null;
  return {
    id: r.id_renegociacion,
    contratoId: r.id_contrato,
    cobroOrigenId: r.id_cobro_origen,
    fecha: toDateOnly(r.fecha),
    motivo: r.motivo,
    condicionesAnteriores: r.condiciones_anteriores,
    condicionesNuevas: r.condiciones_nuevas,
    usuarioAutorizaId: r.id_usuario_autoriza
  };
}

function comision(r) {
  if (!r) return null;
  return {
    id: r.id_comision,
    ventaId: r.id_venta,
    vendedorId: r.id_vendedor,
    porcentajeOMonto: Number(r.porcentaje_o_monto),
    baseIncluyeInicial: r.base_incluye_inicial,
    montoComision: Number(r.monto_comision),
    fechaGeneracion: toDateOnly(r.fecha_generacion),
    fechaPago: toDateOnly(r.fecha_pago),
    estado: r.estado
  };
}

function usuario(r) {
  if (!r) return null;
  return {
    id: r.id_usuario,
    nombre: r.nombre,
    correo: r.correo,
    usuario: r.nombre_acceso,
    rol: r.nombre_rol || r.rol,
    estado: r.estado
  };
}

function rol(r, permisos = []) {
  if (!r) return null;
  return { id: r.id_rol, nombre: r.nombre_rol, permisos };
}

function auditoria(r) {
  if (!r) return null;
  return {
    id: r.id_auditoria,
    usuarioId: r.id_usuario,
    usuario: r.usuario_nombre || "",
    accion: r.accion,
    entidad: r.entidad_afectada,
    entidadId: r.id_entidad_afectada,
    detalle: r.detalle,
    fecha: isoDate(r.fecha_hora)
  };
}

// Traduce el mapa de configuración key/value SQL a las claves camelCase del frontend
const CONFIG_KEY_MAP = {
  dias_reserva_default: "diasReservaDefault",
  porcentaje_mora: "porcentajeMora",
  dias_gracia_mora: "diasGraciaMora",
  impuesto_venta: "impuestoVenta",
  porcentaje_comision_default: "comisionDefault",
  porcentaje_interes_cuota: "porcentajeInteresCuota",
  formato_numero_recibo: "formatoNumeroRecibo",
  moneda_default: "monedaDefault",
  simbolo_moneda: "simboloMoneda",
  requiere_inicial_pagado_para_activar_contrato: "requiereInicialPagadoParaActivarContrato",
  comision_incluye_inicial: "comisionIncluyeInicial",
  nombre_empresa: "nombreEmpresa",
  rnc_empresa: "rncEmpresa",
  direccion_empresa: "direccionEmpresa",
  telefono_empresa: "telefonoEmpresa",
  nota_legal_recibo: "notaLegalRecibo"
};

const CONFIG_NUMERIC_KEYS = new Set([
  "diasReservaDefault", "porcentajeMora", "diasGraciaMora", "impuestoVenta",
  "comisionDefault", "porcentajeInteresCuota"
]);

function configuracion(mapSnakeKV) {
  const out = {};
  for (const [k, v] of Object.entries(mapSnakeKV || {})) {
    const camelKey = CONFIG_KEY_MAP[k] || k;
    if (CONFIG_NUMERIC_KEYS.has(camelKey)) {
      const n = Number(v);
      out[camelKey] = Number.isFinite(n) ? n : v;
    } else if (v === "true" || v === "false") {
      out[camelKey] = v === "true";
    } else {
      out[camelKey] = v;
    }
  }
  return out;
}

// Invierte: cliente envía camelCase, guardamos snake_case
function configPayloadFromApi(patch) {
  const inverse = Object.fromEntries(Object.entries(CONFIG_KEY_MAP).map(([snake, camel]) => [camel, snake]));
  const out = {};
  for (const [k, v] of Object.entries(patch || {})) {
    const snake = inverse[k] || k;
    out[snake] = String(v);
  }
  return out;
}

module.exports = {
  cliente, proyecto, solar, reserva, venta, contrato, cuota, mora,
  cobro, detalleCobro, renegociacion, comision, usuario, rol, auditoria,
  configuracion, configPayloadFromApi
};
