import {
  updateProfile,
  updateProfileImage,
  removeProfileImage,
  getProfile,
} from "#src/controllers/user.controller.js";
import { protectRoute } from "#src/middleware/auth.middleware.js";
import {
  uploadSingle,
  handleMulterError,
  validateFileUpload,
} from "#src/middleware/upload.middleware.js";
import { searchForUsers } from "#controllers/friend.controller.js";
import { rateLimitPerUser } from "#src/middleware/rateLimit.middleware.js";
import express from "express";

const router = express.Router();

router.use(protectRoute);

router.get("/profile", getProfile);

// Name search reveals who has an account, so it is rate limited.
router.get("/search", rateLimitPerUser({ windowMs: 60 * 1000, max: 30 }), searchForUsers);

router.put("/update-profile", updateProfile);

router.put(
  "/update-profile-image",
  uploadSingle,
  handleMulterError,
  validateFileUpload,
  updateProfileImage
);

router.delete("/profile-image", removeProfileImage);

export default router;
