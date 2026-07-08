const jwt = require("jsonwebtoken");
const { env } = require("../config/env");
const { UnauthorizedError } = require("../errors");

function sign(payload) {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: "sistema-venta-solares"
  });
}

function verify(token) {
  try {
    return jwt.verify(token, env.JWT_SECRET, { issuer: "sistema-venta-solares" });
  } catch (err) {
    if (err.name === "TokenExpiredError") throw new UnauthorizedError("Token expirado");
    throw new UnauthorizedError("Token inválido");
  }
}

function extractBearer(header) {
  if (!header || typeof header !== "string") return null;
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return null;
  return parts[1].trim() || null;
}

module.exports = { sign, verify, extractBearer };
