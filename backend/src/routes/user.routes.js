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
import {
  block,
  getBlocked,
  getMessaging,
  getSettings,
  unblock,
  updateSettings,
} from "#controllers/privacy.controller.js";
import { validateObjectIdParam } from "#src/middleware/objectId.middleware.js";
import { rateLimitPerUser } from "#src/middleware/rateLimit.middleware.js";
import express from "express";

const router = express.Router();

router.use(protectRoute);

router.get("/profile", getProfile);

// Name search reveals who has an account, so it is rate limited.
router.get("/search", rateLimitPerUser({ windowMs: 60 * 1000, max: 30 }), searchForUsers);

router.get("/settings", getSettings);
router.patch("/settings", updateSettings);
router.get("/blocked", getBlocked);
router.get("/:id/messaging", validateObjectIdParam("id"), getMessaging);
router.post("/:id/block", validateObjectIdParam("id"), block);
router.delete("/:id/block", validateObjectIdParam("id"), unblock);

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
