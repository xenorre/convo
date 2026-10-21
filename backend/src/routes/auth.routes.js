import express from "express";
import {
  signUp,
  login,
  logout,
  changePassword,
} from "#controllers/auth.controller.js";
import { protectRoute } from "#src/middleware/auth.middleware.js";
import { rateLimitPerUser } from "#src/middleware/rateLimit.middleware.js";

const router = express.Router();

router.post("/sign-up", signUp);
router.post("/login", login);
router.post("/logout", logout);
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
