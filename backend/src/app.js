// imports
import express from "express";
import cookieParser from "cookie-parser";
import logger from "#config/logger.js";
import morgan from "morgan";
import cors from "cors";
import helmet from "helmet";
import {
  corsConfig,
  securityHeaders,
  trustedProxies,
} from "#config/cors.config.js";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import { ENV } from "#config/env.js";

import { requestId } from "#src/middleware/requestId.middleware.js";
import { errorHandler } from "#src/middleware/error.middleware.js";
import { app } from "./config/socket.js";

import authRoutes from "#routes/auth.routes.js";
import userRoutes from "#routes/user.routes.js";
import messageRoutes from "#routes/message.routes.js";
import securityMiddleware from "#src/middleware/security.middleware.js";
import {
  ensureCsrfTokenCookie,
  csrfProtection,
} from "#src/middleware/csrf.middleware.js";

// Core middleware
app.set("trust proxy", trustedProxies);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());
app.use(helmet(securityHeaders));
app.use(cors(corsConfig));

app.use(requestId);

morgan.token("id", (req) => req.requestId);

app.use(
  morgan(
    ":id :remote-addr - :method :url :status :res[content-length] - :response-time ms",
    {
      stream: { write: (message) => logger.info(message.trim()) },
    }
  )
);

// Preflight: cors() above handles OPTIONS automatically in Express 5

// app.use(securityMiddleware);

// CSRF token issuance for safe methods and endpoint to fetch it
app.use(ensureCsrfTokenCookie);
app.get("/csrf-token", (req, res) => {
  const token = req.cookies?.csrfToken;
  res.status(200).json({ csrfToken: token || null });
});

// Enforce CSRF on unsafe methods globally
app.use(csrfProtection);

// Health and readiness endpoints
app.get("/healthz", (req, res) => res.status(200).json({ status: "ok" }));
app.get("/readyz", async (req, res) => {
  const state = mongoose.connection.readyState; // 1 = connected
  return state === 1 ? res.sendStatus(200) : res.sendStatus(503);
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoutes);

app.get("/", (req, res) => {
  res.status(200).send("Welcome to Convo API!");
});

// Serve frontend in production if present
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../public");
if (ENV.NODE_ENV === "production") {
  app.use(express.static(publicDir));
  // Match any path that does NOT start with /api or /socket.io
  const spaFallback = /^(?!\/api|\/socket\.io).*/;
  app.get(spaFallback, (req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

// 404
app.use((req, res) => {
  res.status(404).json({ message: "Not Found", requestId: req.requestId });
});

app.use(errorHandler);

export default app;
