const pino = require("pino");

const transport =
  process.env.NODE_ENV === "development"
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:dd-mm-yyyy HH:MM:ss",
          ignore: "pid,hostname",
        },
      }
    : undefined;

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport,
});

module.exports = logger;
