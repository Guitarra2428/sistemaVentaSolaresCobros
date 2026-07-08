require("dotenv").config();

function required(name) {
  const v = process.env[name];
  if (!v || v.trim() === "") throw new Error(`Variable de entorno requerida no definida: ${name}`);
  return v;
}

function intOr(name, def) {
  const v = process.env[name];
  const n = v ? Number(v) : def;
  if (!Number.isFinite(n)) throw new Error(`Variable ${name} no es numerica`);
  return n;
}

const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: intOr("PORT", 3020),
  DATABASE_URL: required("DATABASE_URL"),
  PG_POOL_MAX: intOr("PG_POOL_MAX", 10),
  PG_IDLE_TIMEOUT_MS: intOr("PG_IDLE_TIMEOUT_MS", 30000),
  JWT_SECRET: process.env.JWT_SECRET || "dev-secret-change-me",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "8h",
  BCRYPT_ROUNDS: intOr("BCRYPT_ROUNDS", 10),
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
  CORS_ORIGINS: (process.env.CORS_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
  LATE_FEE_JOB_TIME: process.env.LATE_FEE_JOB_TIME || "02:00"
};

env.isProd = env.NODE_ENV === "production";
env.isDev = !env.isProd;

module.exports = { env };
