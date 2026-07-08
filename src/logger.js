const pino = require("pino");
const { env } = require("./config/env");

const options = { level: env.LOG_LEVEL };
if (env.isDev) {
  options.transport = { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } };
}

const logger = pino(options);

module.exports = { logger };
