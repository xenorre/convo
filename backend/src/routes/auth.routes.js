import express from "express";
import {
  signUp,
  login,
  logout,
  changePassword,
  verifyEmail,
  resendVerificationEmail,
} from "#controllers/auth.controller.js";
import { protectRoute } from "#src/middleware/auth.middleware.js";
import { rateLimitPerUser } from "#src/middleware/rateLimit.middleware.js";

const router = express.Router();

router.post("/sign-up", signUp);
router.post("/login", login);
router.post("/logout", logout);
// Signed out, so these count per IP address.
router.post("/verify-email", rateLimitPerUser({ windowMs: 15 * 60 * 1000, max: 30 }), verifyEmail);
router.post(
  "/resend-verification",
  rateLimitPerUser({ windowMs: 15 * 60 * 1000, max: 5 }),
  resendVerificationEmail
);
// Limits guessing the current password from a signed-in session.
router.put(
  "/password",
  protectRoute,
  rateLimitPerUser({ windowMs: 15 * 60 * 1000, max: 10 }),
  changePassword
);

router.get("/check", protectRoute, (req, res) =>
  res.status(200).json(req.user)
);

export default router;
