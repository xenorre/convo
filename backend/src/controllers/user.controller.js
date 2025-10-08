import {
  updateUserProfile,
  updateUserProfileImage,
  getUserProfile,
} from "#src/services/user.service.js";
import {
  updateProfileSchema,
  validateImageFile,
} from "#src/validations/user.validation.js";
import { formatValidationError } from "#src/utils/format.js";
import logger from "#config/logger.js";

export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    // Validate request body
    const validationResult = updateProfileSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: formatValidationError(validationResult.error),
      });
    }

    const updatedUser = await updateUserProfile(userId, validationResult.data);

    res.status(200).json({
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    logger.error("Failed to update profile", {
      userId: req.user?.id,
      error: error.message,
    });

    if (error.message === "User not found") {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateProfileImage = async (req, res) => {
  try {
    const userId = req.user.id;
    const file = req.file;

    // Validate file
    const fileErrors = validateImageFile(file);
    if (fileErrors.length > 0) {
      return res.status(400).json({
        error: "File validation failed",
        details: fileErrors,
      });
    }

    const updatedUser = await updateUserProfileImage(userId, file);

    res.status(200).json({
      message: "Profile image updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    logger.error("Failed to update profile image", {
      userId: req.user?.id,
      fileName: req.file?.originalname,
      error: error.message,
    });

    if (error.message === "User not found") {
      return res.status(404).json({ error: "User not found" });
    }

    if (error.message === "Failed to upload file") {
      return res.status(500).json({
        error: "Upload failed",
        message: "Failed to upload image to storage",
      });
    }

    res.status(500).json({ error: "Internal server error" });
  }
};

export const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await getUserProfile(userId);

    res.status(200).json({
      message: "Profile retrieved successfully",
      user,
    });
  } catch (error) {
    logger.error("Failed to get profile", {
      userId: req.user?.id,
      error: error.message,
    });

    if (error.message === "User not found") {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(500).json({ error: "Internal server error" });
  }
};
