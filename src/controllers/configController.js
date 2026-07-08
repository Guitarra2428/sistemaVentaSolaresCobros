const { resolveActorFromRequest, requirePermission } = require("../services/authService");
const config = require("../services/configService");
const { schemas, validate } = require("../validation/schemas");
const { json, parseBody } = require("../utils/http");

async function getConfigAction(req, res) {
  await resolveActorFromRequest(req);
  return json(res, 200, await config.getAll());
}

async function updateConfigAction(req, res) {
  const actor = await resolveActorFromRequest(req);
  await requirePermission(actor, "configurar_parametros");
  const data = validate(schemas.updateConfig, await parseBody(req));
  return json(res, 200, await config.updateMany(actor, data));
}

module.exports = { getConfigAction, updateConfigAction };
