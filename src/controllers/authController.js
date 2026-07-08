const { login } = require("../services/authService");
const { schemas, validate } = require("../validation/schemas");
const { json, parseBody } = require("../utils/http");
const { createLimiter } = require("../middleware/rateLimit");
const { logger } = require("../logger");

const loginLimiter = createLimiter({ windowMs: 60_000, max: 8 });

async function loginAction(req, res) {
  loginLimiter(req);
  const raw = await parseBody(req);
  const payload = validate(schemas.login, raw);
  try {
    const session = await login(payload);
    return json(res, 200, session);
  } catch (err) {
    logger.info({ usuario: payload.usuario, ip: req.socket.remoteAddress }, "Login fallido");
    throw err;
  }
}

module.exports = { loginAction };
