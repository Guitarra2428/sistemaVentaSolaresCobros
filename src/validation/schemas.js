const { z } = require("zod");
const { ValidationError } = require("../errors");

const idInt = z.coerce.number().int().positive();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha debe estar en formato YYYY-MM-DD");
const money = z.coerce.number().finite().nonnegative();

const schemas = {
  login: z.object({
    usuario: z.string().trim().min(1, "Usuario obligatorio").max(50),
    password: z.string().min(1, "Contraseña obligatoria").max(200)
  }),

  createCliente: z.object({
    nombreCompleto: z.string().trim().min(2).max(200),
    cedulaRnc: z.string().trim().min(5).max(20),
    telefono: z.string().max(30).optional().nullable(),
    correo: z.string().email().max(150).optional().nullable().or(z.literal("")),
    direccion: z.string().max(255).optional().nullable(),
    fechaNacimiento: dateStr.optional().nullable().or(z.literal("")),
    estadoCivil: z.string().max(20).optional().nullable(),
    ocupacion: z.string().max(100).optional().nullable()
  }),

  updateCliente: z.object({
    nombreCompleto: z.string().trim().min(2).max(200).optional(),
    telefono: z.string().max(30).optional().nullable(),
    correo: z.string().email().max(150).optional().nullable().or(z.literal("")),
    direccion: z.string().max(255).optional().nullable(),
    fechaNacimiento: dateStr.optional().nullable().or(z.literal("")),
    estadoCivil: z.string().max(20).optional().nullable(),
    ocupacion: z.string().max(100).optional().nullable(),
    estado: z.enum(["Activo", "Inactivo"]).optional()
  }),

  createProyecto: z.object({
    nombre: z.string().trim().min(2).max(150),
    ubicacion: z.string().max(255).optional().nullable(),
    descripcion: z.string().max(500).optional().nullable(),
    cantidadSolares: z.coerce.number().int().nonnegative().optional().nullable()
  }),

  createSolar: z.object({
    idProyecto: idInt,
    manzana: z.string().trim().min(1).max(20),
    numeroSolar: z.string().trim().min(1).max(20),
    metrosCuadrados: z.coerce.number().positive(),
    precioPorMetro: z.coerce.number().positive(),
    ubicacionRef: z.string().max(255).optional().nullable(),
    observaciones: z.string().max(500).optional().nullable()
  }),

  createReserva: z.object({
    idSolar: idInt,
    idCliente: idInt,
    idVendedor: idInt.optional(),
    fechaExpiracion: dateStr.optional()
  }),

  createVenta: z.object({
    idCliente: idInt,
    idSolar: idInt,
    idReserva: idInt.optional().nullable(),
    idVendedor: idInt.optional(),
    fechaVenta: dateStr.optional(),
    precioTotal: money.optional(),
    montoInicial: money,
    cantidadCuotas: z.coerce.number().int().positive(),
    frecuenciaPago: z.enum(["Mensual", "Quincenal", "Semanal", "Personalizada"]).default("Mensual"),
    fechaPrimerPago: dateStr.optional(),
    tasaInteresCuota: z.coerce.number().min(0).max(0.9999).optional(),
    condicionesPago: z.string().max(1000).optional()
  }),

  anularVenta: z.object({
    motivo: z.string().trim().min(3).max(255)
  }),

  createCobro: z.object({
    idContrato: idInt,
    tipoAplicacion: z.enum(["Inicial", "Cuota", "Mora", "Adelanto", "Abono a capital"]),
    monto: z.coerce.number().positive(),
    metodoPago: z.enum(["Efectivo", "Transferencia", "Deposito", "Cheque", "Tarjeta", "Otro"]).default("Efectivo"),
    referenciaPago: z.string().max(100).optional().nullable(),
    modalidadAplicacion: z.enum(["Automatica", "Cuota especifica", "Abono a capital"]).optional(),
    fechaPago: dateStr.optional(),
    idCuota: idInt.optional().nullable(),
    idMora: idInt.optional().nullable(),
    motivoRenegociacion: z.string().max(500).optional(),
    idUsuarioAutoriza: idInt.optional()
  }),

  anularCobro: z.object({
    motivo: z.string().trim().min(3).max(255)
  }),

  updateConfig: z.record(z.union([z.string(), z.number(), z.boolean()])),

  renegotiate: z.object({
    idContrato: idInt,
    motivo: z.string().trim().min(3).max(500),
    cantidadCuotas: z.coerce.number().int().positive(),
    frecuenciaPago: z.enum(["Mensual", "Quincenal", "Semanal", "Personalizada"]).default("Mensual"),
    fechaPrimerPago: dateStr
  }),

  ajustarMora: z.object({
    motivo: z.string().trim().min(3).max(255),
    nuevoMonto: z.coerce.number().positive()
  }),

  anularMora: z.object({
    motivo: z.string().trim().min(3).max(255)
  }),

  auditoriaSearch: z.object({
    entidad: z.string().max(50).optional(),
    idEntidad: z.string().max(50).optional(),
    idUsuario: z.coerce.number().int().positive().optional(),
    desde: z.string().optional(),
    hasta: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100).optional(),
    offset: z.coerce.number().int().min(0).default(0).optional()
  })
};

function validate(schema, payload) {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    throw new ValidationError("Payload inválido", details);
  }
  return result.data;
}

module.exports = { schemas, validate };
