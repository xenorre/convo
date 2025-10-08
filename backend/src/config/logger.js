import winston from "winston";
import fs from "fs";
import { ENV } from "#config/env.js";

// Ensure logs directory exists
try {
  fs.mkdirSync("logs", { recursive: true });
} catch {}

const consoleFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  return `${timestamp} [${level}] ${message}${metaStr}`;
});

const baseFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true })
);

const transports = [];

if (ENV.LOG_TO_FILES === "true") {
  transports.push(
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" })
  );
}

// Always log to console; pretty in dev, JSON in prod
if (ENV.NODE_ENV === "production") {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(baseFormat, winston.format.json()),
    })
  );
} else {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        baseFormat,
        winston.format.colorize({ all: false }),
        consoleFormat
      ),
    })
  );
}

const logger = winston.createLogger({
  level: ENV.LOG_LEVEL || "info",
  format: winston.format.combine(baseFormat, winston.format.json()),
  defaultMeta: { service: "convo-api" },
  transports,
});

export default logger;
