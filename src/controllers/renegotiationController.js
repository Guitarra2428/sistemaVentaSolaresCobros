const { resolveActorFromRequest, requirePermission } = require("../services/authService");
const { renegotiate } = require("../services/renegotiationService");
const { schemas, validate } = require("../validation/schemas");
const { json, parseBody } = require("../utils/http");

async function createRenegotiationAction(req, res) {
  const actor = await resolveActorFromRequest(req);
  await requirePermission(actor, "renegociar_contrato");
  const data = validate(schemas.renegotiate, await parseBody(req));
  return json(res, 201, await renegotiate(actor, data));
}

module.exports = { createRenegotiationAction };
