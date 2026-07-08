const { resolveActorFromRequest, requirePermission } = require("../services/authService");
const svc = require("../services/solarBlockService");
const { json, parseBody } = require("../utils/http");

async function bloquearAction(req, res, { id }) {
  const actor = await resolveActorFromRequest(req);
  await requirePermission(actor, "registrar_solar");
  const payload = await parseBody(req);
  return json(res, 200, await svc.bloquear(actor, Number(id), payload));
}

async function desbloquearAction(req, res, { id }) {
  const actor = await resolveActorFromRequest(req);
  await requirePermission(actor, "registrar_solar");
  const payload = await parseBody(req);
  return json(res, 200, await svc.desbloquear(actor, Number(id), payload.motivo));
}

module.exports = { bloquearAction, desbloquearAction };
