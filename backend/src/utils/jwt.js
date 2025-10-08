import logger from "#config/logger.js";
import jwt from "jsonwebtoken";
import { ENV } from "#config/env.js";

const jwtSecret = ENV.JWT_SECRET;
const jwtExpiresIn = ENV.JWT_EXPIRES_IN;

export const jwttoken = {
  sign: (payload) => {
    try {
      const token = jwt.sign(payload, jwtSecret, {
        expiresIn: jwtExpiresIn,
      });
      return token;
    } catch (e) {
      logger.error("Failed to authenticate JWT:", e);
      throw new Error("Failed to authenticate JWT");
    }
  },
  verify: (token) => {
    try {
      const decoded = jwt.verify(token, jwtSecret);
      return decoded;
    } catch (error) {
      logger.error("Failed to verify JWT:", error);
      throw new Error("Failed to verify JWT");
    }
  },
};
