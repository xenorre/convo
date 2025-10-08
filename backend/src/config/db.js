import mongoose from "mongoose";
import { ENV } from "#config/env.js";
import logger from "#config/logger.js";

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(ENV.DATABASE_URL);
    logger.info("Connected to MongoDB", { host: conn.connection.host });
  } catch (error) {
    logger.error("Error connecting to MongoDB", { error: error.message });
    process.exit(1);
  }
};
