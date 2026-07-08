const { Pool } = require("pg");
const { env } = require("../config/env");
const { logger } = require("../logger");

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.PG_POOL_MAX,
  idleTimeoutMillis: env.PG_IDLE_TIMEOUT_MS
});

pool.on("error", (err) => {
  logger.error({ err }, "Error inesperado en cliente PG del pool");
});

async function q(text, params) {
  return pool.query(text, params);
}

async function one(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] || null;
}

async function many(text, params) {
  const { rows } = await pool.query(text, params);
  return rows;
}

async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) { /* noop */ }
    throw err;
  } finally {
    client.release();
  }
}

async function close() {
  await pool.end();
}

module.exports = { pool, q, one, many, withTx, close };
