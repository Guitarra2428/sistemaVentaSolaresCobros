const { resolveActorFromRequest } = require("../services/authService");
const { generateLateFees } = require("../services/lateFeeService");
const { snapshotGlobal } = require("../services/balanceService");
const { json } = require("../utils/http");

async function generateLateFeesAction(req, res) {
  const actor = await resolveActorFromRequest(req);
  const generated = await generateLateFees(actor);
  const data = await snapshotGlobal();
  return json(res, 201, { generated, data });
}

module.exports = { generateLateFeesAction };
