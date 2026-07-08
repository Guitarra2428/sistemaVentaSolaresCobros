const { resolveActorFromRequest, requirePermission } = require("../services/authService");
const { search } = require("../services/auditQueryService");
const { schemas, validate } = require("../validation/schemas");
const { json } = require("../utils/http");

async function searchAuditoriaAction(req, res) {
  const actor = await resolveActorFromRequest(req);
  await requirePermission(actor, "consultar_auditoria");
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const query = Object.fromEntries(url.searchParams);
  const filters = validate(schemas.auditoriaSearch, query);
  return json(res, 200, await search(filters));
}

module.exports = { searchAuditoriaAction };
