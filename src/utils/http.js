const { AppError } = require("../errors");
const { logger } = require("../logger");

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function parseBody(req, limitBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > limitBytes) {
        req.destroy();
        reject(new AppError("Payload demasiado grande", 413, "PAYLOAD_TOO_LARGE"));
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new AppError("JSON invalido", 400, "INVALID_JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendError(res, err, reqCtx = {}) {
  if (err instanceof AppError) {
    const body = { error: err.message, code: err.code };
    if (err.details) body.details = err.details;
    json(res, err.status, body);
    return;
  }
  // PG constraint violations traducidas a mensajes humanos comunes
  if (err && err.code) {
    const pgCode = err.code;
    if (pgCode === "23505") { json(res, 409, { error: "Violación de unicidad", code: "UNIQUE_VIOLATION", detail: err.detail }); return; }
    if (pgCode === "23503") { json(res, 400, { error: "Referencia inválida", code: "FK_VIOLATION", detail: err.detail }); return; }
    if (pgCode === "23514") { json(res, 400, { error: "Restricción CHECK violada", code: "CHECK_VIOLATION", detail: err.detail }); return; }
  }
  logger.error({ err, ...reqCtx }, "Error no controlado");
  json(res, 500, { error: "Error interno del servidor", code: "INTERNAL_ERROR" });
}

module.exports = { json, parseBody, sendError };
