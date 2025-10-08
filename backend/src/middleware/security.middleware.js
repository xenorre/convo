import aj from "#config/arcjet.js";
import { slidingWindow } from "@arcjet/node";
import logger from "#config/logger.js";

const securityMiddleware = async (req, res, next) => {
  try {
    const client = aj.withRule(
      slidingWindow({
        mode: "LIVE",
        interval: "1m",
        max: 50,
      })
    );

    const decision = await client.protect(req);

    if (decision.isDenied() && decision.reason.isBot()) {
      logger.warn("Bot request blocked", {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        path: req.path,
      });

      return res
        .status(403)
        .json({ error: "Forbidden", message: "Bot request blocked" });
    }

    if (decision.isDenied() && decision.reason.isShield()) {
      logger.warn("Shield blocked request", {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        path: req.path,
        method: req.method,
      });

      return res.status(403).json({
        error: "Forbidden",
        message: "Request blocked by security policy",
      });
    }

    if (decision.isDenied() && decision.reason.isRateLimit()) {
      logger.warn("Rate limit exceeded", {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        path: req.path,
      });

      return res
        .status(429)
        .json({ error: "Too Many Requests", message: "Too many requests" });
    }

    next();
  } catch (e) {
    console.error("Arcjet middleware error:", e);
    res.status(500).json({
      error: "Internal server error",
      message: "Something went wrong with security middleware",
    });
  }
};

export default securityMiddleware;
