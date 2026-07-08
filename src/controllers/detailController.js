const { resolveActorFromRequest } = require("../services/authService");
const detail = require("../services/detailService");
const { json } = require("../utils/http");
const { NotFoundError } = require("../errors");

async function clienteDetalleAction(req, res, { id }) {
  await resolveActorFromRequest(req);
  const result = await detail.detalleCliente(Number(id));
  if (!result) throw new NotFoundError("Cliente no encontrado");
  return json(res, 200, result);
}

async function solarHistorialAction(req, res, { id }) {
  await resolveActorFromRequest(req);
  const result = await detail.historialSolar(Number(id));
  if (!result) throw new NotFoundError("Solar no encontrado");
  return json(res, 200, result);
}

async function reciboDetalleAction(req, res, { id }) {
  await resolveActorFromRequest(req);
  const result = await detail.detalleRecibo(Number(id));
  if (!result) throw new NotFoundError("Recibo no encontrado");
  return json(res, 200, result);
}

module.exports = { clienteDetalleAction, solarHistorialAction, reciboDetalleAction };
