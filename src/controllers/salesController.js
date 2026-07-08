const { resolveActorFromRequest, requirePermission } = require("../services/authService");
const { createSale, anularVenta } = require("../services/salesService");
const { schemas, validate } = require("../validation/schemas");
const { json, parseBody } = require("../utils/http");

async function createSaleAction(req, res) {
  const actor = await resolveActorFromRequest(req);
  await requirePermission(actor, "registrar_venta");
  const data = validate(schemas.createVenta, await parseBody(req));
  return json(res, 201, await createSale(actor, data));
}

async function anularVentaAction(req, res, { id }) {
  const actor = await resolveActorFromRequest(req);
  await requirePermission(actor, "anular_venta");
  const data = validate(schemas.anularVenta, await parseBody(req));
  return json(res, 200, await anularVenta(actor, Number(id), data.motivo));
}

module.exports = { createSaleAction, anularVentaAction };
