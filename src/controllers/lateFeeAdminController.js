const { resolveActorFromRequest, requirePermission } = require("../services/authService");
const { ajustarMora, anularMora } = require("../services/lateFeeAdminService");
const { schemas, validate } = require("../validation/schemas");
const { json, parseBody } = require("../utils/http");

async function ajustarMoraAction(req, res, { id }) {
  const actor = await resolveActorFromRequest(req);
  await requirePermission(actor, "ajustar_anular_mora");
  const data = validate(schemas.ajustarMora, await parseBody(req));
  return json(res, 200, await ajustarMora(actor, Number(id), data));
}

async function anularMoraAction(req, res, { id }) {
  const actor = await resolveActorFromRequest(req);
  await requirePermission(actor, "ajustar_anular_mora");
  const data = validate(schemas.anularMora, await parseBody(req));
  return json(res, 200, await anularMora(actor, Number(id), data.motivo));
}

module.exports = { ajustarMoraAction, anularMoraAction };
