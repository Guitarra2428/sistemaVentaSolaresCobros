const { resolveActorFromRequest, requirePermission } = require("../services/authService");
const svc = require("../services/commissionService");
const { json } = require("../utils/http");

function queryParams(req) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  return Object.fromEntries(url.searchParams);
}

async function listAction(req, res) {
  const actor = await resolveActorFromRequest(req);
  const f = queryParams(req);
  if (actor.rol === "Vendedor") f.idVendedor = actor.idUsuario;
  return json(res, 200, await svc.list(f));
}

async function marcarPagadaAction(req, res, { id }) {
  const actor = await resolveActorFromRequest(req);
  await requirePermission(actor, "marcar_comision_pagada");
  return json(res, 200, await svc.marcarPagada(actor, Number(id)));
}

module.exports = { listAction, marcarPagadaAction };
