const { resolveActorFromRequest, requirePermission } = require("../services/authService");
const catalog = require("../services/catalogService");
const { schemas, validate } = require("../validation/schemas");
const { json, parseBody } = require("../utils/http");

async function createClientAction(req, res) {
  const actor = await resolveActorFromRequest(req);
  await requirePermission(actor, "crear_cliente");
  const data = validate(schemas.createCliente, await parseBody(req));
  return json(res, 201, await catalog.createCliente(actor, data));
}

async function updateClientAction(req, res, { id }) {
  const actor = await resolveActorFromRequest(req);
  await requirePermission(actor, "editar_cliente");
  const data = validate(schemas.updateCliente, await parseBody(req));
  return json(res, 200, await catalog.updateCliente(actor, Number(id), data));
}

async function listClientsAction(req, res) {
  await resolveActorFromRequest(req);
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const filters = Object.fromEntries(url.searchParams);
  return json(res, 200, await catalog.listClientes(filters));
}

async function similarClientsAction(req, res) {
  await resolveActorFromRequest(req);
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const nombre = url.searchParams.get("nombreCompleto") || "";
  const cedula = url.searchParams.get("cedulaRnc") || "";
  return json(res, 200, await catalog.buscarClientesSimilares(nombre, cedula));
}

async function createProjectAction(req, res) {
  const actor = await resolveActorFromRequest(req);
  await requirePermission(actor, "registrar_proyecto");
  const data = validate(schemas.createProyecto, await parseBody(req));
  return json(res, 201, await catalog.createProyecto(actor, data));
}

async function createLotAction(req, res) {
  const actor = await resolveActorFromRequest(req);
  await requirePermission(actor, "registrar_solar");
  const data = validate(schemas.createSolar, await parseBody(req));
  return json(res, 201, await catalog.createSolar(actor, data));
}

async function createReservationAction(req, res) {
  const actor = await resolveActorFromRequest(req);
  await requirePermission(actor, "reservar_solar");
  const data = validate(schemas.createReserva, await parseBody(req));
  return json(res, 201, await catalog.createReserva(actor, data));
}

async function cancelReservationAction(req, res, { id }) {
  const actor = await resolveActorFromRequest(req);
  await requirePermission(actor, "reservar_solar");
  const body = await parseBody(req);
  return json(res, 200, await catalog.cancelReserva(actor, Number(id), body.motivo));
}

module.exports = {
  createClientAction, updateClientAction, listClientsAction, similarClientsAction,
  createProjectAction, createLotAction, createReservationAction, cancelReservationAction
};
