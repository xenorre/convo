import crypto from "crypto";
import { ENV } from "#config/env.js";

const isUnsafeMethod = (method) => ["POST", "PUT", "PATCH", "DELETE"].includes(method);

const allowedOrigins = () => {
  const devAllowed = [
    /^https?:\/\/localhost:\d+$/,
    /^https?:\/\/127\.0\.0\.1:\d+$/,
    /^https?:\/\/192\.168\.\d+\.\d+:\d+$/,
  ];
  if (ENV.CLIENT_URL) devAllowed.push(ENV.CLIENT_URL);
  const isDev = ENV.NODE_ENV !== "production";
  return isDev ? devAllowed : [ENV.CLIENT_URL].filter(Boolean);
};

const originAllowed = (origin) => {
  if (!origin) return true; // Some clients (mobile, curl) may not send an Origin
  return allowedOrigins().some((pat) =>
    typeof pat === "string" ? pat === origin : pat.test(origin)
  );
};

export const ensureCsrfTokenCookie = (req, res, next) => {
  // Only issue/refresh token on safe methods to reduce overhead
  if (req.method === "GET" || req.method === "HEAD") {
    let token = req.cookies?.csrfToken;
    if (!token) {
      token = crypto.randomBytes(32).toString("hex");
      res.cookie("csrfToken", token, {
        httpOnly: false, // must be readable by client JS
        secure: ENV.NODE_ENV === "production",
        sameSite: ENV.NODE_ENV === "production" ? "None" : "Lax",
        path: "/",
      });
    }
  }
  next();
};

export const csrfProtection = (req, res, next) => {
  if (!isUnsafeMethod(req.method)) return next();

  const origin = req.get("Origin") || req.get("Referer");
  if (!originAllowed(origin)) {
    return res.status(403).json({ error: "Forbidden", message: "Origin not allowed" });
  }

  const headerToken = req.get("x-csrf-token");
  const cookieToken = req.cookies?.csrfToken;

  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    return res.status(403).json({ error: "Forbidden", message: "Invalid CSRF token" });
  }

  next();
};