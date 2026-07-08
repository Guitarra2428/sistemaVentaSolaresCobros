const http = require("node:http");
const crypto = require("node:crypto");
const { env } = require("./src/config/env");
const { logger } = require("./src/logger");
const { handleApi } = require("./src/routes/apiRouter");
const { serveStatic } = require("./src/views/staticView");
const { applySecurityHeaders, applyCors } = require("./src/middleware/security");
const dbPool = require("./src/db/pool");
const lateFeeJob = require("./src/scheduler/lateFeeJob");
const reservationExpiryJob = require("./src/scheduler/reservationExpiryJob");

async function main() {
  // Verificar conectividad temprano — falla rápido si la DB no está.
  await dbPool.q("SELECT 1");
  logger.info({ pool_max: env.PG_POOL_MAX }, "Postgres pool listo");

  const server = http.createServer((req, res) => {
    req.id = crypto.randomUUID();
    res.setHeader("X-Request-Id", req.id);
    applySecurityHeaders(res);
    applyCors(req, res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url.startsWith("/api/")) {
      handleApi(req, res);
      return;
    }
    serveStatic(req, res);
  });

  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, `Sistema Venta Solares corriendo en http://localhost:${env.PORT}`);
  });

  const stopLateFee = lateFeeJob.start();
  const stopReservationExpiry = reservationExpiryJob.start("03:00");

  const shutdown = async (signal) => {
    stopLateFee();
    stopReservationExpiry();
    logger.info({ signal }, "Recibida señal, cerrando gracefully...");
    server.close(() => logger.info("Servidor HTTP cerrado"));
    try {
      await dbPool.close();
      logger.info("Pool de Postgres cerrado");
    } catch (e) {
      logger.error({ err: e }, "Error cerrando pool");
    }
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.fatal({ err }, "Falla al arrancar servidor");
  process.exit(1);
});
