#!/usr/bin/env node
// Smoke test end-to-end: arranca contra la instancia corriendo y valida el
// flujo golden path. Usa fetch nativo de Node 18+.
require("dotenv").config();
const BASE = process.env.SMOKE_BASE_URL || `http://localhost:${process.env.PORT || 3020}`;

let token = null;
let pass = 0;
let fail = 0;
const failures = [];

async function req(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* raw */ }
  return { status: res.status, json, text };
}

function assert(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else {
    fail++;
    failures.push({ name, extra });
    console.log(`  ✗ ${name}${extra ? " -> " + JSON.stringify(extra) : ""}`);
  }
}

async function main() {
  console.log(`Smoke contra ${BASE}\n`);

  // 1) Login
  const login = await req("POST", "/api/login", { usuario: "admin", password: "admin123" });
  assert("login admin", login.status === 200 && !!login.json.token, { status: login.status, body: login.json });
  token = login.json && login.json.token;
  if (!token) throw new Error("Sin token — no se puede continuar");

  // 2) Login mal → 401
  const bad = await req("POST", "/api/login", { usuario: "admin", password: "no" });
  assert("login inválido → 401", bad.status === 401);

  // 3) Bootstrap
  const boot = await req("GET", "/api/bootstrap");
  assert("bootstrap 200 con data", boot.status === 200 && !!boot.json.data && !!boot.json.user);
  const usuarios = boot.json.data.usuarios;
  const solaresDisponibles = boot.json.data.solares.filter(s => s.estado === "Disponible");
  const clientes = boot.json.data.clientes;
  assert("hay usuarios semilla", usuarios.length >= 4);
  assert("hay solares disponibles", solaresDisponibles.length > 0);
  assert("hay clientes", clientes.length > 0);

  // 4) Permisos: admin tiene 27
  assert("permisos admin", boot.json.permisos.length >= 27);

  // 5) Crear cliente nuevo
  const nuevoCli = await req("POST", "/api/clientes", {
    nombreCompleto: "Smoke Cliente Test", cedulaRnc: `SMOKE-${Date.now()}`, telefono: "809-555-9999"
  });
  assert("crear cliente 201", nuevoCli.status === 201 && !!nuevoCli.json.id);

  // 6) Crear venta sobre primer solar disponible
  const solar = solaresDisponibles[0];
  const venta = await req("POST", "/api/ventas", {
    idCliente: nuevoCli.json.id,
    idSolar: solar.id,
    montoInicial: Math.round(solar.precioTotal * 0.10 * 100) / 100,
    cantidadCuotas: 12,
    frecuenciaPago: "Mensual",
    fechaPrimerPago: isoOffset(30)
  });
  assert("crear venta 201", venta.status === 201 && !!venta.json.contrato, { status: venta.status, body: venta.json });
  const contratoId = venta.json && venta.json.contrato && venta.json.contrato.id;
  const idVenta = venta.json && venta.json.venta && venta.json.venta.id;

  // 7) Bootstrap: solar debe estar Bloqueado
  const boot2 = await req("GET", "/api/bootstrap");
  const solarPost = boot2.json.data.solares.find(s => s.id === solar.id);
  assert("solar bloqueado tras venta", solarPost.estado === "Bloqueado" && solarPost.tipoBloqueo === "Venta pendiente de inicial");

  // 8) Cobrar inicial → contrato Activo, solar Vendido
  const cobroIni = await req("POST", "/api/cobros", {
    idContrato: contratoId,
    tipoAplicacion: "Inicial",
    monto: venta.json.venta.montoInicial,
    metodoPago: "Efectivo"
  });
  assert("cobro inicial 201", cobroIni.status === 201);
  const contratoPost = cobroIni.json.data.contratos.find(c => c.id === contratoId);
  const solarPost2 = cobroIni.json.data.solares.find(s => s.id === solar.id);
  assert("contrato activo tras inicial", contratoPost.estado === "Activo");
  assert("solar vendido tras inicial", solarPost2.estado === "Vendido");

  // 9) Validación: crear otro cobro inicial → debe fallar
  const dobleIni = await req("POST", "/api/cobros", {
    idContrato: contratoId,
    tipoAplicacion: "Inicial",
    monto: 100,
    metodoPago: "Efectivo"
  });
  assert("segundo inicial rechazado", dobleIni.status >= 400);

  // 10) Reporte de solares
  const rep = await req("GET", "/api/reportes/solares");
  assert("reporte solares 200", rep.status === 200 && Array.isArray(rep.json.items));

  // 11) Reporte de mora
  const repM = await req("GET", "/api/reportes/mora");
  assert("reporte mora 200", repM.status === 200);

  // 12) Estado de cuenta
  const est = await req("GET", `/api/estado-cuenta/${contratoId}`);
  assert("estado de cuenta 200", est.status === 200 && !!est.json.contrato);
  assert("estado de cuenta tiene cuotas", Array.isArray(est.json.cuotas) && est.json.cuotas.length === 12);

  // 13) Rate limit login — verifica que 429 aparece
  const badTries = [];
  for (let i = 0; i < 12; i++) badTries.push(req("POST", "/api/login", { usuario: "admin", password: "nope" }));
  const results = await Promise.all(badTries);
  const has429 = results.some(r => r.status === 429);
  assert("rate limit login activo", has429);

  // 14) Auditoría (con token válido — hace login otra vez porque el rate limit no bloquea tokens ya emitidos)
  const aud = await req("GET", "/api/auditoria?limit=10");
  assert("auditoria 200", aud.status === 200 && Array.isArray(aud.json));

  console.log(`\nResumen: ${pass} pass / ${fail} fail`);
  if (fail > 0) {
    console.log("Fallas:");
    for (const f of failures) console.log(" -", f.name, f.extra || "");
    process.exit(1);
  }
}

function isoOffset(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

main().catch((e) => {
  console.error("Smoke abortado:", e.message);
  console.error(e.stack);
  process.exit(1);
});
