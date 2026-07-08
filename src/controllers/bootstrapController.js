const { resolveActorFromRequest, sessionFor, findUserById } = require("../services/authService");
const { snapshotGlobal } = require("../services/balanceService");
const { one } = require("../db/pool");
const { json } = require("../utils/http");

async function bootstrap(req, res) {
  const actor = await resolveActorFromRequest(req);
  const userRow = await one(
    `SELECT u.*, r.nombre_rol FROM usuarios u
       JOIN roles r ON r.id_rol = u.id_rol WHERE u.id_usuario = $1`,
    [actor.idUsuario]
  );
  const session = await sessionFor(userRow);
  const data = await snapshotGlobal();
  return json(res, 200, { ...session, data });
}

module.exports = { bootstrap };
