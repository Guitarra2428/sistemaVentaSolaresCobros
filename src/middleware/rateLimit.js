const { AppError } = require("../errors");

// Ventana deslizante en memoria. Suficiente para una sola instancia; en cluster/HA
// requiere Redis o similar (fuera de v1.0).
function createLimiter({ windowMs = 60_000, max = 5 } = {}) {
  const buckets = new Map();
  return function limit(req) {
    const key = clientKey(req);
    const now = Date.now();
    const list = (buckets.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      throw new AppError("Demasiados intentos. Espere un momento.", 429, "RATE_LIMITED");
    }
    list.push(now);
    buckets.set(key, list);
    if (buckets.size > 10000) evictOldest(buckets);
  };
}

function clientKey(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

function evictOldest(map) {
  const first = map.keys().next().value;
  if (first !== undefined) map.delete(first);
}

module.exports = { createLimiter };
