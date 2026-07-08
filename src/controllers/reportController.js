const { resolveActorFromRequest, requirePermission } = require("../services/authService");
const r = require("../services/reportService");
const { json } = require("../utils/http");

function queryParams(req) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  return Object.fromEntries(url.searchParams);
}

async function ventasAction(req, res) {
  const actor = await resolveActorFromRequest(req);
  await requirePermission(actor, actor.rol === "Vendedor" ? "ver_reportes_ventas_propias" : "ver_reportes_ventas");
  const f = queryParams(req);
  if (actor.rol === "Vendedor") f.idVendedor = actor.idUsuario;
  return json(res, 200, await r.reporteVentas(f));
}

async function cobrosAction(req, res) {
  const actor = await resolveActorFromRequest(req);
  await requirePermission(actor, actor.rol === "Cajero" ? "ver_reportes_cobros_propios" : "ver_reportes_cobros");
  const f = queryParams(req);
  if (actor.rol === "Cajero") f.idUsuario = actor.idUsuario;
  return json(res, 200, await r.reporteCobros(f));
}

async function moraAction(req, res) {
  const actor = await resolveActorFromRequest(req);
  await requirePermission(actor, actor.rol === "Cajero" ? "ver_reporte_mora_propio" : "ver_reporte_mora");
  return json(res, 200, await r.reporteMora(queryParams(req)));
}

async function comisionesAction(req, res) {
  const actor = await resolveActorFromRequest(req);
  await requirePermission(actor, actor.rol === "Vendedor" ? "ver_reporte_comisiones_propias" : "ver_reporte_comisiones");
  const f = queryParams(req);
  if (actor.rol === "Vendedor") f.idVendedor = actor.idUsuario;
  return json(res, 200, await r.reporteComisiones(f));
}

async function solaresAction(req, res) {
  await resolveActorFromRequest(req);
  return json(res, 200, await r.reporteSolares(queryParams(req)));
}

async function estadoCuentaAction(req, res, { id }) {
  await resolveActorFromRequest(req);
  const result = await r.estadoCuenta(Number(id));
  if (!result) return json(res, 404, { error: "Contrato no encontrado", code: "NOT_FOUND" });
  return json(res, 200, result);
}

module.exports = { ventasAction, cobrosAction, moraAction, comisionesAction, solaresAction, estadoCuentaAction };
