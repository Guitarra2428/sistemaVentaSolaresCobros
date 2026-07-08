const { resolveActorFromRequest, requirePermission } = require("../services/authService");
const { createCollection, anularCobro } = require("../services/collectionService");
const { snapshotGlobal } = require("../services/balanceService");
const { schemas, validate } = require("../validation/schemas");
const { json, parseBody } = require("../utils/http");

const PERM_BY_TIPO = {
  "Inicial": "registrar_cobro_inicial",
  "Cuota": "registrar_adelanto",
  "Adelanto": "registrar_adelanto",
  "Mora": "registrar_pago_mora",
  "Abono a capital": "registrar_abono_capital"
};

async function createCollectionAction(req, res) {
  const actor = await resolveActorFromRequest(req);
  const data = validate(schemas.createCobro, await parseBody(req));
  const perm = PERM_BY_TIPO[data.tipoAplicacion];
  if (perm) await requirePermission(actor, perm);
  const result = await createCollection(actor, data);
  const dataSnap = await snapshotGlobal();
  return json(res, 201, { ...result, data: dataSnap });
}

async function anularCobroAction(req, res, { id }) {
  const actor = await resolveActorFromRequest(req);
  await requirePermission(actor, "anular_recibo");
  const data = validate(schemas.anularCobro, await parseBody(req));
  return json(res, 200, await anularCobro(actor, Number(id), data.motivo));
}

module.exports = { createCollectionAction, anularCobroAction };
