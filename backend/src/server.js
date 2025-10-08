import { connectDB } from "./config/db.js";
import { ENV, validateEnvOrThrow } from "#config/env.js";
import logger from "#config/logger.js";
import { server } from "./config/socket.js";
import "./app.js";
import mongoose from "mongoose";

const PORT = ENV.PORT || 3000;

const start = async () => {
  try {
    validateEnvOrThrow();
    await connectDB();
    server.listen(PORT, () => {
      logger.info(`Server is running on http://localhost:${PORT}`);
    });
  } catch (err) {
    logger.error("Failed to start server", { error: err.message });
    process.exit(1);
  }
};

async function shutdown(signal) {
  try {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    await mongoose.connection.close();
    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });
    // Fallback in case close hangs
    setTimeout(() => {
      logger.warn("Force exiting after timeout");
      process.exit(1);
    }, 10000).unref();
  } catch (e) {
    logger.error("Error during shutdown", { error: e.message });
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

start();
