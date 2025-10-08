import { ENV } from "#config/env.js";

export const cookies = {
  getOptions: () => {
    const isDevTunnel =
      ENV.CLIENT_URL && ENV.CLIENT_URL.includes("devtunnels.ms");

    const maxAge = Number(ENV.COOKIE_MAX_AGE_MS) || 15 * 60 * 1000; // default 15 minutes

    return {
      httpOnly: true,
      secure: ENV.NODE_ENV === "production" || isDevTunnel, // secure=true for HTTPS dev tunnels
      sameSite: isDevTunnel || ENV.NODE_ENV === "production" ? "None" : "Lax", // None for cross-origin HTTPS
      maxAge,
      ...(isDevTunnel && { domain: undefined }), // Do not set domain for dev tunnels
    };
  },

  set: (res, name, value, options = {}) => {
    res.cookie(name, value, { ...cookies.getOptions(), ...options });
  },

  clear: (res, name, options = {}) => {
    res.clearCookie(name, { ...cookies.getOptions(), ...options });
  },

  get: (req, name) => {
    return req.cookies?.[name];
  },
};
