const { loginAction } = require("../controllers/authController");
const { bootstrap } = require("../controllers/bootstrapController");
const catalog = require("../controllers/catalogController");
const sales = require("../controllers/salesController");
const collection = require("../controllers/collectionController");
const lateFees = require("../controllers/lateFeeController");
const lateFeesAdmin = require("../controllers/lateFeeAdminController");
const reneg = require("../controllers/renegotiationController");
const audit = require("../controllers/auditController");
const config = require("../controllers/configController");
const reports = require("../controllers/reportController");
const detail = require("../controllers/detailController");
const commissions = require("../controllers/commissionController");
const solarBlock = require("../controllers/solarBlockController");
const health = require("../controllers/healthController");
const password = require("../controllers/passwordController");
const { createLimiter } = require("../middleware/rateLimit");

// Rate limits por endpoint sensible (además del que ya tiene /api/login internamente).
const limitCobros = createLimiter({ windowMs: 60_000, max: 60 });
const limitVentas = createLimiter({ windowMs: 60_000, max: 30 });
const limitMoraGen = createLimiter({ windowMs: 60_000, max: 5 });
const { json, sendError } = require("../utils/http");
const { logger } = require("../logger");

// Definición de rutas. Cada entrada es { method, pattern, handler }.
// El pattern puede contener parámetros nombrados como :id que se extraen y se
// pasan al handler como tercer argumento en un objeto de params.
const routes = [
  { method: "GET",    pattern: "/api/health",            handler: health.healthAction, publicRoute: true },
  { method: "POST",   pattern: "/api/login",             handler: loginAction, publicRoute: true },
  { method: "POST",   pattern: "/api/cambiar-password",  handler: password.cambiarPasswordAction },
  { method: "GET",    pattern: "/api/bootstrap",         handler: bootstrap },
  { method: "GET",    pattern: "/api/clientes",          handler: catalog.listClientsAction },
  { method: "GET",    pattern: "/api/clientes/similares", handler: catalog.similarClientsAction },
  { method: "POST",   pattern: "/api/clientes",          handler: catalog.createClientAction },
  { method: "PUT",    pattern: "/api/clientes/:id",      handler: catalog.updateClientAction },
  { method: "POST",   pattern: "/api/proyectos",         handler: catalog.createProjectAction },
  { method: "POST",   pattern: "/api/solares",           handler: catalog.createLotAction },
  { method: "POST",   pattern: "/api/solares/:id/bloquear",   handler: solarBlock.bloquearAction },
  { method: "POST",   pattern: "/api/solares/:id/desbloquear", handler: solarBlock.desbloquearAction },
  { method: "POST",   pattern: "/api/reservas",          handler: catalog.createReservationAction },
  { method: "DELETE", pattern: "/api/reservas/:id",      handler: catalog.cancelReservationAction },
  { method: "POST",   pattern: "/api/ventas",            handler: sales.createSaleAction, limiter: limitVentas },
  { method: "DELETE", pattern: "/api/ventas/:id",        handler: sales.anularVentaAction },
  { method: "POST",   pattern: "/api/cobros",            handler: collection.createCollectionAction, limiter: limitCobros },
  { method: "DELETE", pattern: "/api/cobros/:id",        handler: collection.anularCobroAction },
  { method: "POST",   pattern: "/api/mora/generar",      handler: lateFees.generateLateFeesAction, limiter: limitMoraGen },
  { method: "GET",    pattern: "/api/comisiones",             handler: commissions.listAction },
  { method: "PUT",    pattern: "/api/comisiones/:id/pagar",   handler: commissions.marcarPagadaAction },
  { method: "PUT",    pattern: "/api/mora/:id",          handler: lateFeesAdmin.ajustarMoraAction },
  { method: "DELETE", pattern: "/api/mora/:id",          handler: lateFeesAdmin.anularMoraAction },
  { method: "POST",   pattern: "/api/renegociaciones",   handler: reneg.createRenegotiationAction },
  { method: "GET",    pattern: "/api/auditoria",         handler: audit.searchAuditoriaAction },
  { method: "GET",    pattern: "/api/configuracion",     handler: config.getConfigAction },
  { method: "PATCH",  pattern: "/api/configuracion",     handler: config.updateConfigAction },
  { method: "GET",    pattern: "/api/reportes/ventas",        handler: reports.ventasAction },
  { method: "GET",    pattern: "/api/reportes/cobros",        handler: reports.cobrosAction },
  { method: "GET",    pattern: "/api/reportes/mora",          handler: reports.moraAction },
  { method: "GET",    pattern: "/api/reportes/comisiones",    handler: reports.comisionesAction },
  { method: "GET",    pattern: "/api/reportes/solares",       handler: reports.solaresAction },
  { method: "GET",    pattern: "/api/estado-cuenta/:id",      handler: reports.estadoCuentaAction },
  { method: "GET",    pattern: "/api/clientes/:id/detalle",   handler: detail.clienteDetalleAction },
  { method: "GET",    pattern: "/api/solares/:id/historial",  handler: detail.solarHistorialAction },
  { method: "GET",    pattern: "/api/cobros/:id/detalle",     handler: detail.reciboDetalleAction }
];

function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    if (r.pattern === pathname) return { route: r, params: {} };
    if (!r.pattern.includes(":")) continue;
    const patternParts = r.pattern.split("/");
    const pathParts = pathname.split("/");
    if (patternParts.length !== pathParts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(":")) {
        params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
      } else if (patternParts[i] !== pathParts[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route: r, params };
  }
  return null;
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const match = matchRoute(req.method, url.pathname);
  const ctx = { method: req.method, path: url.pathname, reqId: req.id };
  if (!match) {
    logger.info({ ...ctx, status: 404 }, "API 404");
    return json(res, 404, { error: "Ruta no encontrada", code: "NOT_FOUND" });
  }

  const started = Date.now();
  try {
    if (match.route.limiter) match.route.limiter(req);
    await match.route.handler(req, res, match.params);
    logger.info({ ...ctx, ms: Date.now() - started }, "API ok");
  } catch (err) {
    const status = err.status || 500;
    logger.warn({ ...ctx, ms: Date.now() - started, err: err.message, code: err.code, status }, "API error");
    sendError(res, err, ctx);
  }
}

module.exports = { handleApi };
