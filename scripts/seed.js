#!/usr/bin/env node
/**
 * Seed exhaustivo: cubre TODOS los estados y escenarios de negocio
 * que puede vivir el sistema. Cada bloque está etiquetado con [Ex] para
 * que puedas mapearlo contra el reporte final.
 *
 * Estados cubiertos:
 *   Solar:     Disponible, Reservado, Bloqueado(Venta pendiente/Administrativo/Legal/Otro), Vendido, Anulado
 *   Reserva:   Activa, Expirada, Cancelada, Convertida en venta
 *   Contrato:  Pendiente de inicial, Activo, En mora, Saldado, Anulado
 *   Venta:     Activa, Saldada, Anulada
 *   Cuota:     Pendiente, Pagada, Parcialmente pagada, Vencida, Anulada
 *   Mora:      Pendiente, Parcialmente pagada, Pagada, Anulada
 *   Cobro:     Registrado, Anulado
 *   Comisión:  Pendiente, Pagada
 *   Cliente:   Activo, Inactivo
 *   Usuario:   Activo (+ variedad de roles)
 *
 * Frecuencias de pago: Mensual, Quincenal, Semanal
 * Tasas de interés distintas: 0.008, 0.012 (default), 0.015, 0.02
 */
require("dotenv").config();
const { pool, withTx, close, q } = require("../src/db/pool");
const { hashPassword } = require("../src/utils/hash");
const catalog = require("../src/services/catalogService");
const { createSale, anularVenta } = require("../src/services/salesService");
const { createCollection, anularCobro } = require("../src/services/collectionService");
const { generateLateFees } = require("../src/services/lateFeeService");
const { renegotiate } = require("../src/services/renegotiationService");
const { ajustarMora, anularMora } = require("../src/services/lateFeeAdminService");
const { bloquear: bloquearSolar } = require("../src/services/solarBlockService");
const { marcarPagada: marcarComisionPagada } = require("../src/services/commissionService");
const { updateMany: updateConfig } = require("../src/services/configService");
const { expireReservations } = require("../src/scheduler/reservationExpiryJob");

const USERS = [
  { nombre: "Administrador",       correo: "admin@solares.local",     nombre_acceso: "admin",     password: "admin123",     rol: "Administrador" },
  { nombre: "Laura Ventas",        correo: "ventas@solares.local",    nombre_acceso: "vendedor",  password: "ventas123",    rol: "Vendedor" },
  { nombre: "Miguel Álvarez",      correo: "malvarez@solares.local",  nombre_acceso: "vendedor2", password: "ventas456",    rol: "Vendedor" },
  { nombre: "Carlos Caja",         correo: "caja@solares.local",      nombre_acceso: "cajero",    password: "caja123",      rol: "Cajero" },
  { nombre: "Rosa Rodríguez",      correo: "rrodriguez@solares.local",nombre_acceso: "cajero2",   password: "caja456",      rol: "Cajero" },
  { nombre: "Gabriela Gerencia",   correo: "gerencia@solares.local",  nombre_acceso: "gerente",   password: "gerente123",   rol: "Gerente" }
];

async function seedUsers() {
  const out = {};
  for (const u of USERS) {
    const hash = await hashPassword(u.password);
    const { rows } = await pool.query(
      `INSERT INTO usuarios (id_rol, nombre, correo, nombre_acceso, password_hash, password_debe_cambiar)
       SELECT r.id_rol, $2, $3, $4, $5, false FROM roles r WHERE r.nombre_rol = $1
       ON CONFLICT (nombre_acceso) DO UPDATE SET password_hash = EXCLUDED.password_hash,
         estado = 'Activo', password_debe_cambiar = false
       RETURNING id_usuario, nombre_acceso`,
      [u.rol, u.nombre, u.correo, u.nombre_acceso, hash]
    );
    out[u.nombre_acceso] = rows[0];
  }
  return out;
}

async function actor(idUsuario) {
  const { rows: [r] } = await pool.query(
    `SELECT u.id_usuario, u.nombre, u.id_rol, ro.nombre_rol
       FROM usuarios u JOIN roles ro ON ro.id_rol = u.id_rol WHERE u.id_usuario = $1`,
    [idUsuario]
  );
  return { idUsuario: r.id_usuario, nombre: r.nombre, idRol: r.id_rol, rol: r.nombre_rol };
}

function daysFromNow(days) { const d = new Date(); d.setUTCDate(d.getUTCDate() + days); return d; }
function iso(d) { return d.toISOString().slice(0, 10); }

async function main() {
  console.log("═══ SEED EXHAUSTIVO ═══\n");

  console.log("→ Usuarios");
  const users = await seedUsers();
  const admin    = await actor(users.admin.id_usuario);
  const vendedor = await actor(users.vendedor.id_usuario);
  const vendedor2 = await actor(users.vendedor2.id_usuario);
  const cajero   = await actor(users.cajero.id_usuario);
  const cajero2  = await actor(users.cajero2.id_usuario);
  const gerente  = await actor(users.gerente.id_usuario);
  console.log(`  ${USERS.length} usuarios (2 admin/gerente, 2 vendedores, 2 cajeros)`);

  // ── Cambio de configuración para dejar rastro en auditoría ─────────
  console.log("→ Ajustes de configuración (para dejar auditoría)");
  await updateConfig(admin, { diasGraciaMora: 7 });
  await updateConfig(admin, { diasGraciaMora: 5 });

  // ── Proyectos ─────────────────────────────────────────────────────
  console.log("→ Proyectos");
  const proyAurora  = await catalog.createProyecto(admin, { nombre: "Residencial Aurora", ubicacion: "Santo Domingo Norte", descripcion: "Urbanización 24 solares residenciales", cantidadSolares: 24 });
  const proyVillas  = await catalog.createProyecto(admin, { nombre: "Villas del Mar", ubicacion: "Boca Chica", descripcion: "Solares frente al mar", cantidadSolares: 12 });
  const proyJardin  = await catalog.createProyecto(admin, { nombre: "Ciudad Jardín", ubicacion: "Santiago", descripcion: "Fase preventa", cantidadSolares: 12 });
  console.log("  3 proyectos");

  // ── Solares (30 totales) ──────────────────────────────────────────
  console.log("→ Solares (30)");
  const sol = {};
  // Aurora: A-01..A-08 y B-01..B-04
  for (const [mz, nums] of [["A", 8], ["B", 4]]) {
    for (let i = 1; i <= nums; i++) {
      const s = await catalog.createSolar(admin, {
        idProyecto: proyAurora.id, manzana: mz, numeroSolar: String(i).padStart(2, "0"),
        metrosCuadrados: 240 + (i * 5), precioPorMetro: 3200
      });
      sol[`${mz}-${String(i).padStart(2, "0")}`] = s;
    }
  }
  // Villas del Mar: M-01..M-06
  for (let i = 1; i <= 6; i++) {
    const s = await catalog.createSolar(admin, {
      idProyecto: proyVillas.id, manzana: "M", numeroSolar: String(i).padStart(2, "0"),
      metrosCuadrados: 320, precioPorMetro: 4800
    });
    sol[`M-${String(i).padStart(2, "0")}`] = s;
  }
  // Ciudad Jardín: C-01..C-06
  for (let i = 1; i <= 6; i++) {
    const s = await catalog.createSolar(admin, {
      idProyecto: proyJardin.id, manzana: "C", numeroSolar: String(i).padStart(2, "0"),
      metrosCuadrados: 200, precioPorMetro: 2600
    });
    sol[`C-${String(i).padStart(2, "0")}`] = s;
  }
  console.log(`  ${Object.keys(sol).length} solares (todos Disponibles al inicio)`);

  // ── Clientes ─────────────────────────────────────────────────────
  console.log("→ Clientes (11: 10 activos + 1 inactivo)");
  const seedClientes = [
    { nombreCompleto: "Marta Jiménez",     cedulaRnc: "001-0000001-1", telefono: "809-555-0101", correo: "marta@example.com",  ocupacion: "Comerciante" },
    { nombreCompleto: "Pedro Reyes",       cedulaRnc: "001-0000002-2", telefono: "809-555-0102", correo: "pedro@example.com",  ocupacion: "Ingeniero" },
    { nombreCompleto: "Sofía Ramírez",     cedulaRnc: "001-0000003-3", telefono: "809-555-0103", correo: "sofia@example.com",  ocupacion: "Doctora" },
    { nombreCompleto: "Luis Fernández",    cedulaRnc: "001-0000004-4", telefono: "809-555-0104", correo: "luis@example.com",   ocupacion: "Contador" },
    { nombreCompleto: "Ana Martínez",      cedulaRnc: "001-0000005-5", telefono: "809-555-0105", correo: "ana@example.com",    ocupacion: "Abogada" },
    { nombreCompleto: "Roberto Castillo",  cedulaRnc: "001-0000006-6", telefono: "809-555-0106", correo: "roberto@example.com",ocupacion: "Empresario" },
    { nombreCompleto: "Isabel Peña",       cedulaRnc: "001-0000007-7", telefono: "809-555-0107", correo: "isabel@example.com", ocupacion: "Arquitecta" },
    { nombreCompleto: "Diego Suárez",      cedulaRnc: "001-0000008-8", telefono: "809-555-0108", correo: "diego@example.com",  ocupacion: "Chofer" },
    { nombreCompleto: "Carmen Vargas",     cedulaRnc: "001-0000009-9", telefono: "809-555-0109", correo: "carmen@example.com", ocupacion: "Docente" },
    { nombreCompleto: "Jorge Mercado",     cedulaRnc: "001-0000010-0", telefono: "809-555-0110", correo: "jorge@example.com",  ocupacion: "Chef" },
    { nombreCompleto: "Cliente Inactivo",  cedulaRnc: "001-9999999-9", telefono: "809-555-9999", correo: "inactivo@example.com", ocupacion: "N/A" }
  ];
  const cli = [];
  for (const c of seedClientes) cli.push(await catalog.createCliente(admin, c));
  // El último cliente queda Inactivo
  await catalog.updateCliente(admin, cli[10].id, { estado: "Inactivo" });
  console.log("  11 clientes, último marcado Inactivo");

  // ── Reservas: 4 estados ───────────────────────────────────────────
  console.log("→ Reservas (4 estados: Activa, Convertida en venta, Expirada, Cancelada)");

  // [R1] Activa vigente — no convertida
  const rActiva = await catalog.createReserva(vendedor, {
    idSolar: sol["A-07"].id, idCliente: cli[0].id, fechaExpiracion: iso(daysFromNow(15))
  });

  // [R2] Convertida en venta (se convertirá en Venta E5 abajo)
  const rConvertir = await catalog.createReserva(vendedor, {
    idSolar: sol["A-02"].id, idCliente: cli[1].id, fechaExpiracion: iso(daysFromNow(20))
  });

  // [R3] Expirada — fecha ya pasó
  const rExpirada = await catalog.createReserva(vendedor2, {
    idSolar: sol["A-08"].id, idCliente: cli[2].id, fechaExpiracion: iso(daysFromNow(15))
  });
  // Forzar fechas al pasado (respetando el CHECK fecha_expiracion >= fecha_reserva) y ejecutar el job
  await q(
    `UPDATE reservas
        SET fecha_reserva = CURRENT_DATE - INTERVAL '30 days',
            fecha_expiracion = CURRENT_DATE - INTERVAL '5 days'
      WHERE id_reserva = $1`, [rExpirada.id]
  );
  await expireReservations();

  // [R4] Cancelada (no hay endpoint, se hace por SQL directo con auditoría manual)
  const rCancel = await catalog.createReserva(vendedor2, {
    idSolar: sol["B-04"].id, idCliente: cli[3].id, fechaExpiracion: iso(daysFromNow(10))
  });
  await withTx(async (client) => {
    await client.query("UPDATE reservas SET estado = 'Cancelada', fecha_modificacion = now(), id_usuario_modifica = $2 WHERE id_reserva = $1",
      [rCancel.id, gerente.idUsuario]);
    await client.query("UPDATE solares SET estado = 'Disponible', fecha_modificacion = now() WHERE id_solar = $1", [sol["B-04"].id]);
    await client.query(`INSERT INTO auditoria (id_usuario, accion, entidad_afectada, id_entidad_afectada, detalle)
                        VALUES ($1, 'Cancelar reserva', 'reservas', $2, $3)`,
      [gerente.idUsuario, String(rCancel.id), JSON.stringify({ motivo: "Cliente cambió de opinión" })]);
  });
  console.log("  Activa=1, Convertida=1, Expirada=1, Cancelada=1");

  // ═══ VENTAS: 12 escenarios distintos ══════════════════════════════
  console.log("→ Ventas (12 escenarios)");

  // [E4] Venta PENDIENTE DE INICIAL — solar Bloqueado, sin cobros
  const vPend = await createSale(vendedor, {
    idCliente: cli[3].id, idSolar: sol["A-01"].id,
    montoInicial: 76800, cantidadCuotas: 24, frecuenciaPago: "Mensual",
    fechaPrimerPago: iso(daysFromNow(30)), precioTotal: 768000
  });
  console.log(`  [E4] ${vPend.contrato.numero} Pendiente de inicial (solar bloqueado)`);

  // [E5] Venta ACTIVA (con reserva convertida), inicial cobrado, todo al día
  const vActiva = await createSale(vendedor, {
    idCliente: cli[1].id, idSolar: sol["A-02"].id, idReserva: rConvertir.id,
    montoInicial: 120000, cantidadCuotas: 12, frecuenciaPago: "Mensual",
    fechaPrimerPago: iso(daysFromNow(30)), precioTotal: 800000
  });
  await createCollection(cajero, {
    idContrato: vActiva.contrato.id, tipoAplicacion: "Inicial",
    monto: vActiva.venta.montoInicial, metodoPago: "Transferencia", referenciaPago: "TRX-A02-INI"
  });
  console.log(`  [E5] ${vActiva.contrato.numero} Activa, inicial pagado, sin mora`);

  // [E6] Venta ACTIVA con cuota vencida → mora Pendiente
  const vMora = await createSale(vendedor, {
    idCliente: cli[2].id, idSolar: sol["A-03"].id,
    montoInicial: 78000, cantidadCuotas: 18, frecuenciaPago: "Mensual",
    fechaPrimerPago: iso(daysFromNow(-60)), precioTotal: 780000
  });
  await createCollection(cajero, {
    idContrato: vMora.contrato.id, tipoAplicacion: "Inicial",
    monto: vMora.venta.montoInicial, metodoPago: "Efectivo"
  });
  const moraE6 = await generateLateFees(admin);
  console.log(`  [E6] ${vMora.contrato.numero} En mora, ${moraE6.length} cargo(s) generado(s)`);

  // [E7] Venta con mora PARCIALMENTE PAGADA
  const vMoraParcial = await createSale(vendedor, {
    idCliente: cli[3].id, idSolar: sol["A-04"].id,
    montoInicial: 78000, cantidadCuotas: 18, frecuenciaPago: "Mensual",
    fechaPrimerPago: iso(daysFromNow(-45)), precioTotal: 780000
  });
  await createCollection(cajero, {
    idContrato: vMoraParcial.contrato.id, tipoAplicacion: "Inicial",
    monto: vMoraParcial.venta.montoInicial, metodoPago: "Efectivo"
  });
  const moraE7 = await generateLateFees(admin);
  // Pagar 40% del primer cargo de mora del E7
  const primeraMoraE7 = (await pool.query(
    "SELECT m.* FROM mora m JOIN cuotas cu ON cu.id_cuota = m.id_cuota WHERE cu.id_contrato = $1 ORDER BY m.id_mora LIMIT 1",
    [vMoraParcial.contrato.id]
  )).rows[0];
  if (primeraMoraE7) {
    const parcial = Math.round(Number(primeraMoraE7.monto_mora) * 0.4 * 100) / 100;
    await createCollection(cajero2, {
      idContrato: vMoraParcial.contrato.id, tipoAplicacion: "Mora",
      idMora: primeraMoraE7.id_mora, monto: parcial, metodoPago: "Efectivo"
    });
  }
  console.log(`  [E7] ${vMoraParcial.contrato.numero} En mora con pago parcial de mora`);

  // [E8] Venta con mora TOTALMENTE PAGADA + cuota pagada
  const vMoraOK = await createSale(vendedor2, {
    idCliente: cli[4].id, idSolar: sol["A-05"].id,
    montoInicial: 80000, cantidadCuotas: 12, frecuenciaPago: "Mensual",
    fechaPrimerPago: iso(daysFromNow(-40)), precioTotal: 800000
  });
  await createCollection(cajero, {
    idContrato: vMoraOK.contrato.id, tipoAplicacion: "Inicial",
    monto: vMoraOK.venta.montoInicial, metodoPago: "Efectivo"
  });
  await generateLateFees(admin);
  const moraE8 = (await pool.query(
    "SELECT m.* FROM mora m JOIN cuotas cu ON cu.id_cuota = m.id_cuota WHERE cu.id_contrato = $1 ORDER BY m.id_mora LIMIT 1",
    [vMoraOK.contrato.id]
  )).rows[0];
  if (moraE8) {
    await createCollection(cajero, {
      idContrato: vMoraOK.contrato.id, tipoAplicacion: "Mora",
      idMora: moraE8.id_mora, monto: Number(moraE8.monto_mora), metodoPago: "Efectivo"
    });
  }
  // También pagar la cuota vencida
  const cuotaE8 = (await pool.query(
    "SELECT id_cuota, monto FROM cuotas WHERE id_contrato = $1 ORDER BY numero_cuota LIMIT 1",
    [vMoraOK.contrato.id]
  )).rows[0];
  await createCollection(cajero, {
    idContrato: vMoraOK.contrato.id, tipoAplicacion: "Cuota",
    idCuota: cuotaE8.id_cuota, monto: Number(cuotaE8.monto), metodoPago: "Efectivo"
  });
  console.log(`  [E8] ${vMoraOK.contrato.numero} Mora saldada y cuota pagada`);

  // [E9] Abono a capital (registra renegociación implícita)
  const vAbono = await createSale(vendedor, {
    idCliente: cli[5].id, idSolar: sol["A-06"].id,
    montoInicial: 80000, cantidadCuotas: 24, frecuenciaPago: "Mensual",
    fechaPrimerPago: iso(daysFromNow(30)), precioTotal: 800000
  });
  await createCollection(cajero, {
    idContrato: vAbono.contrato.id, tipoAplicacion: "Inicial",
    monto: vAbono.venta.montoInicial, metodoPago: "Efectivo"
  });
  await createCollection(cajero, {
    idContrato: vAbono.contrato.id, tipoAplicacion: "Abono a capital",
    monto: 50000, metodoPago: "Transferencia",
    motivoRenegociacion: "Cliente desea abonar capital adicional"
  });
  console.log(`  [E9] ${vAbono.contrato.numero} con abono a capital`);

  // [E10] Renegociación FORMAL completa
  const vReneg = await createSale(vendedor, {
    idCliente: cli[6].id, idSolar: sol["B-01"].id,
    montoInicial: 82000, cantidadCuotas: 12, frecuenciaPago: "Mensual",
    fechaPrimerPago: iso(daysFromNow(-30)), precioTotal: 820000
  });
  await createCollection(cajero, {
    idContrato: vReneg.contrato.id, tipoAplicacion: "Inicial",
    monto: vReneg.venta.montoInicial, metodoPago: "Cheque", referenciaPago: "CHK-001"
  });
  // Pagar cuota 1 completa
  const cuotasReneg = (await pool.query(
    "SELECT id_cuota, monto FROM cuotas WHERE id_contrato = $1 ORDER BY numero_cuota",
    [vReneg.contrato.id]
  )).rows;
  await createCollection(cajero, {
    idContrato: vReneg.contrato.id, tipoAplicacion: "Cuota",
    idCuota: cuotasReneg[0].id_cuota, monto: Number(cuotasReneg[0].monto), metodoPago: "Efectivo"
  });
  // Renegociar el plan
  await renegotiate(gerente, {
    idContrato: vReneg.contrato.id, motivo: "Cliente pide reducir cuota mensual",
    cantidadCuotas: 18, frecuenciaPago: "Mensual", fechaPrimerPago: iso(daysFromNow(30))
  });
  console.log(`  [E10] ${vReneg.contrato.numero} renegociado (cuotas anuladas + plan nuevo)`);

  // [E11] Venta SALDADA (todo pagado) — Marta segundo contrato
  const vSaldada = await createSale(vendedor2, {
    idCliente: cli[0].id, idSolar: sol["B-02"].id,
    montoInicial: 100000, cantidadCuotas: 3, frecuenciaPago: "Mensual",
    fechaPrimerPago: iso(daysFromNow(-30)), precioTotal: 600000
  });
  await createCollection(cajero2, {
    idContrato: vSaldada.contrato.id, tipoAplicacion: "Inicial",
    monto: vSaldada.venta.montoInicial, metodoPago: "Efectivo"
  });
  const cuotasSald = (await pool.query(
    "SELECT id_cuota, monto FROM cuotas WHERE id_contrato = $1 ORDER BY numero_cuota",
    [vSaldada.contrato.id]
  )).rows;
  for (const cq of cuotasSald) {
    await createCollection(cajero2, {
      idContrato: vSaldada.contrato.id, tipoAplicacion: "Cuota",
      idCuota: cq.id_cuota, monto: Number(cq.monto), metodoPago: "Efectivo"
    });
  }
  // Marcar la comisión de esa venta como pagada
  const comSald = (await pool.query(
    "SELECT id_comision FROM comisiones WHERE id_venta = $1", [vSaldada.venta.id]
  )).rows[0];
  if (comSald) await marcarComisionPagada(admin, comSald.id_comision);
  console.log(`  [E11] ${vSaldada.contrato.numero} SALDADO, comisión pagada`);

  // [E12] Venta ANULADA antes del inicial
  const vAnular = await createSale(vendedor, {
    idCliente: cli[7].id, idSolar: sol["B-03"].id,
    montoInicial: 76800, cantidadCuotas: 12, frecuenciaPago: "Mensual",
    fechaPrimerPago: iso(daysFromNow(30)), precioTotal: 768000
  });
  await anularVenta(gerente, vAnular.venta.id, "Cliente desistió — no logró conseguir el aval del banco");
  console.log(`  [E12] ${vAnular.contrato.numero} ANULADA, solar liberado`);

  // [E13] Venta con COBRO ANULADO — pagamos cuota, luego anulamos el cobro
  const vCobroAnul = await createSale(vendedor, {
    idCliente: cli[8].id, idSolar: sol["M-01"].id,
    montoInicial: 153600, cantidadCuotas: 12, frecuenciaPago: "Mensual",
    fechaPrimerPago: iso(daysFromNow(30)), precioTotal: 1536000
  });
  await createCollection(cajero, {
    idContrato: vCobroAnul.contrato.id, tipoAplicacion: "Inicial",
    monto: vCobroAnul.venta.montoInicial, metodoPago: "Efectivo"
  });
  const cuotaCA = (await pool.query(
    "SELECT id_cuota, monto FROM cuotas WHERE id_contrato = $1 ORDER BY numero_cuota LIMIT 1",
    [vCobroAnul.contrato.id]
  )).rows[0];
  const cobroACancelar = await createCollection(cajero, {
    idContrato: vCobroAnul.contrato.id, tipoAplicacion: "Cuota",
    idCuota: cuotaCA.id_cuota, monto: Number(cuotaCA.monto), metodoPago: "Cheque", referenciaPago: "CHK-999"
  });
  await anularCobro(gerente, cobroACancelar.cobro.id, "Cheque rebotó — recuperación fallida");
  console.log(`  [E13] ${vCobroAnul.contrato.numero} con recibo ${cobroACancelar.cobro.numero} anulado`);

  // [E14] Frecuencia QUINCENAL
  const vQuincena = await createSale(vendedor2, {
    idCliente: cli[9].id, idSolar: sol["M-02"].id,
    montoInicial: 153600, cantidadCuotas: 24, frecuenciaPago: "Quincenal",
    fechaPrimerPago: iso(daysFromNow(15)), precioTotal: 1536000
  });
  await createCollection(cajero2, {
    idContrato: vQuincena.contrato.id, tipoAplicacion: "Inicial",
    monto: vQuincena.venta.montoInicial, metodoPago: "Transferencia"
  });
  console.log(`  [E14] ${vQuincena.contrato.numero} frecuencia Quincenal`);

  // [E15] Frecuencia SEMANAL + tasa alta 0.02
  const vSemanal = await createSale(vendedor2, {
    idCliente: cli[6].id, idSolar: sol["M-03"].id,
    montoInicial: 100000, cantidadCuotas: 20, frecuenciaPago: "Semanal",
    fechaPrimerPago: iso(daysFromNow(7)), precioTotal: 1536000,
    tasaInteresCuota: 0.02
  });
  await createCollection(cajero, {
    idContrato: vSemanal.contrato.id, tipoAplicacion: "Inicial",
    monto: vSemanal.venta.montoInicial, metodoPago: "Efectivo"
  });
  console.log(`  [E15] ${vSemanal.contrato.numero} Semanal, tasa 2.0%`);

  // [E16] Tasa REDUCIDA para cliente VIP (Pedro segundo contrato)
  const vVIP = await createSale(vendedor, {
    idCliente: cli[1].id, idSolar: sol["A-08"].id,   // A-08 quedó libre tras R3 expirada
    montoInicial: 120000, cantidadCuotas: 12, frecuenciaPago: "Mensual",
    fechaPrimerPago: iso(daysFromNow(30)), precioTotal: 800000,
    tasaInteresCuota: 0.008
  });
  await createCollection(cajero, {
    idContrato: vVIP.contrato.id, tipoAplicacion: "Inicial",
    monto: vVIP.venta.montoInicial, metodoPago: "Transferencia"
  });
  console.log(`  [E16] ${vVIP.contrato.numero} tasa reducida VIP 0.8%`);

  // [E17] Mora ANULADA — generar mora sobre venta E6 y anular una
  const moraParaAnular = (await pool.query(
    "SELECT m.id_mora FROM mora m JOIN cuotas cu ON cu.id_cuota = m.id_cuota WHERE cu.id_contrato = $1 AND m.estado = 'Pendiente' ORDER BY m.id_mora DESC LIMIT 1",
    [vMora.contrato.id]
  )).rows[0];
  if (moraParaAnular) {
    await anularMora(admin, moraParaAnular.id_mora, "Ajuste comercial autorizado — cliente en negociación de pago");
    console.log(`  [E17] Mora ${moraParaAnular.id_mora} anulada en contrato ${vMora.contrato.numero}`);
  }

  // [E18] Mora AJUSTADA (cambia el monto)
  const moraParaAjustar = (await pool.query(
    "SELECT id_mora, monto_mora FROM mora WHERE estado = 'Pendiente' ORDER BY id_mora DESC LIMIT 1"
  )).rows[0];
  if (moraParaAjustar) {
    const nuevoMonto = Math.round(Number(moraParaAjustar.monto_mora) * 0.6 * 100) / 100;
    await ajustarMora(admin, moraParaAjustar.id_mora, {
      motivo: "Cliente presentó documentación válida — reducción aprobada",
      nuevoMonto
    });
    console.log(`  [E18] Mora ${moraParaAjustar.id_mora} ajustada a RD$${nuevoMonto}`);
  }

  // ── Solares con bloqueos manuales ─────────────────────────────────
  console.log("→ Solares con bloqueos manuales");
  await bloquearSolar(admin, sol["M-04"].id, { tipoBloqueo: "Administrativo", motivo: "Retirado temporalmente para revisión de linderos" });
  await bloquearSolar(admin, sol["M-05"].id, { tipoBloqueo: "Legal",         motivo: "Disputa de deslinde con vecino" });
  await bloquearSolar(admin, sol["M-06"].id, { tipoBloqueo: "Otro",          motivo: "Cambio de uso pendiente de aprobación municipal" });
  console.log("  M-04 Admin, M-05 Legal, M-06 Otro");

  // ── Solar Anulado (por SQL directo, no hay endpoint) ─────────────
  await withTx(async (client) => {
    await client.query("UPDATE solares SET estado = 'Anulado', tipo_bloqueo = NULL, fecha_modificacion = now(), id_usuario_modifica = $2 WHERE id_solar = $1",
      [sol["C-01"].id, admin.idUsuario]);
    await client.query(`INSERT INTO auditoria (id_usuario, accion, entidad_afectada, id_entidad_afectada, detalle)
                        VALUES ($1, 'Anular solar', 'solares', $2, $3)`,
      [admin.idUsuario, String(sol["C-01"].id), JSON.stringify({ motivo: "Error de registro — el solar no existe físicamente" })]);
  });
  console.log("  C-01 Anulado");

  // ── Cliente con MÚLTIPLES contratos activos (Marta ya tiene E5? no, es Pedro) ──
  // Marta ya tiene E11 saldado + B-02
  // Añadimos otro contrato para Marta para demostrar fidelidad
  const vFidel = await createSale(vendedor, {
    idCliente: cli[0].id, idSolar: sol["C-02"].id,
    montoInicial: 41600, cantidadCuotas: 6, frecuenciaPago: "Mensual",
    fechaPrimerPago: iso(daysFromNow(30)), precioTotal: 520000
  });
  await createCollection(cajero, {
    idContrato: vFidel.contrato.id, tipoAplicacion: "Inicial",
    monto: vFidel.venta.montoInicial, metodoPago: "Efectivo"
  });
  console.log(`  [E19] Marta segundo contrato ACTIVO ${vFidel.contrato.numero} (cliente recurrente)`);

  // ── Resumen final ─────────────────────────────────────────────────
  const rs = (await pool.query(`
    SELECT
      (SELECT count(*) FROM usuarios) AS usuarios,
      (SELECT count(*) FROM clientes) AS clientes,
      (SELECT count(*) FROM clientes WHERE estado='Inactivo') AS clientes_inactivos,
      (SELECT count(*) FROM proyectos) AS proyectos,
      (SELECT count(*) FROM solares) AS solares,
      (SELECT count(*) FROM solares WHERE estado='Disponible') AS solares_disponibles,
      (SELECT count(*) FROM solares WHERE estado='Reservado') AS solares_reservados,
      (SELECT count(*) FROM solares WHERE estado='Bloqueado') AS solares_bloqueados,
      (SELECT count(*) FROM solares WHERE estado='Vendido') AS solares_vendidos,
      (SELECT count(*) FROM solares WHERE estado='Anulado') AS solares_anulados,
      (SELECT count(*) FROM reservas) AS reservas,
      (SELECT string_agg(DISTINCT estado, ', ') FROM reservas) AS estados_reservas,
      (SELECT count(*) FROM ventas) AS ventas,
      (SELECT count(*) FROM contratos) AS contratos,
      (SELECT string_agg(DISTINCT estado, ', ') FROM contratos) AS estados_contratos,
      (SELECT count(*) FROM cuotas) AS cuotas,
      (SELECT string_agg(DISTINCT estado, ', ') FROM cuotas) AS estados_cuotas,
      (SELECT count(*) FROM cobros) AS cobros,
      (SELECT count(*) FROM cobros WHERE estado='Anulado') AS cobros_anulados,
      (SELECT count(*) FROM mora) AS mora,
      (SELECT string_agg(DISTINCT estado, ', ') FROM mora) AS estados_mora,
      (SELECT count(*) FROM renegociaciones) AS renegociaciones,
      (SELECT count(*) FROM comisiones) AS comisiones,
      (SELECT count(*) FROM comisiones WHERE estado='Pagada') AS comisiones_pagadas,
      (SELECT count(*) FROM auditoria) AS auditoria
  `)).rows[0];

  console.log("\n═══ RESUMEN ═══");
  Object.entries(rs).forEach(([k, v]) => console.log(`  ${k.padEnd(25)}: ${v}`));

  console.log("\nUsuarios y contraseñas:");
  for (const u of USERS) console.log(`  ${u.nombre_acceso.padEnd(10)} / ${u.password.padEnd(12)} (${u.rol})`);

  await close();
}

main().catch((e) => {
  console.error("Falló el seed:", e.message);
  console.error(e.stack);
  process.exit(1);
});
