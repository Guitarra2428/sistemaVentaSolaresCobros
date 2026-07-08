const bcrypt = require("bcryptjs");
const { env } = require("../config/env");

const BCRYPT_PREFIXES = ["$2a$", "$2b$", "$2y$"];

function isBcryptHash(v) {
  if (typeof v !== "string") return false;
  return BCRYPT_PREFIXES.some((p) => v.startsWith(p)) && v.length >= 55;
}

async function hashPassword(plain) {
  return bcrypt.hash(String(plain), env.BCRYPT_ROUNDS);
}

async function verifyPassword(plain, stored) {
  if (typeof stored !== "string" || !stored) return false;
  if (isBcryptHash(stored)) return bcrypt.compare(String(plain), stored);
  // Fallback: durante la ventana de migración, un password_hash NO bcrypt
  // se compara en claro. Al primer login exitoso, el llamador debe rehashearlo.
  return String(plain) === stored;
}

module.exports = { hashPassword, verifyPassword, isBcryptHash };
