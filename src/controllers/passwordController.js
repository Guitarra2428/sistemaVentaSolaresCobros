const { resolveActorFromRequest, cambiarPassword } = require("../services/authService");
const { json, parseBody } = require("../utils/http");

async function cambiarPasswordAction(req, res) {
  const actor = await resolveActorFromRequest(req);
  const payload = await parseBody(req);
  return json(res, 200, await cambiarPassword(actor, payload));
}

module.exports = { cambiarPasswordAction };
