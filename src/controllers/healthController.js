const { one } = require("../db/pool");
const { json } = require("../utils/http");
const pkg = require("../../package.json");

const startedAt = Date.now();

async function healthAction(req, res) {
  let db = "up";
  try { await one("SELECT 1 AS ok"); } catch { db = "down"; }
  return json(res, db === "up" ? 200 : 503, {
    ok: db === "up",
    db,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    version: pkg.version,
    env: process.env.NODE_ENV || "development"
  });
}

module.exports = { healthAction };
