import express from "express";
import {
  signUp,
  login,
  logout,
  changePassword,
} from "#controllers/auth.controller.js";
import { protectRoute } from "#src/middleware/auth.middleware.js";

const router = express.Router();

router.post("/sign-up", signUp);
router.post("/login", login);
router.post("/logout", logout);
router.put("/password", protectRoute, changePassword);

router.get("/check", protectRoute, (req, res) =>
  res.status(200).json(req.user)
);

export default router;
