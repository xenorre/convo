import {
  updateProfile,
  updateProfileImage,
  getProfile,
} from "#src/controllers/user.controller.js";
import { protectRoute } from "#src/middleware/auth.middleware.js";
import {
  uploadSingle,
  handleMulterError,
  validateFileUpload,
} from "#src/middleware/upload.middleware.js";
import express from "express";

const router = express.Router();

router.use(protectRoute);

router.get("/profile", getProfile);

router.put("/update-profile", updateProfile);

router.put(
  "/update-profile-image",
  uploadSingle,
  handleMulterError,
  validateFileUpload,
  updateProfileImage
);

export default router;
