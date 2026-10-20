import User from "#src/models/user.model.js";
import logger from "#config/logger.js";
import {
  uploadProfileImage,
  deleteFile,
} from "#src/services/storage.service.js";

export const DEFAULT_PROFILE_PIC = User.schema.path("profilePic").defaultValue;

// The schema default (and older placeholder URLs) live outside our storage.
export const isDefaultProfileImage = (url) =>
  !url || url.includes("wikimedia.org") || url.includes("placeholder");

const deleteStoredProfileImage = async (userId, imageUrl) => {
  if (isDefaultProfileImage(imageUrl)) return;
  try {
    await deleteFile(imageUrl);
    logger.info("Old profile image deleted", { userId, oldImageUrl: imageUrl });
  } catch (deleteError) {
    logger.warn("Failed to delete old profile image", {
      userId,
      oldImageUrl: imageUrl,
      error: deleteError.message,
    });
  }
};

export const updateUserProfileImage = async (userId, fileData) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const oldProfilePic = user.profilePic;

    const newImageUrl = await uploadProfileImage(
      fileData.buffer,
      fileData.originalname,
      fileData.mimetype,
      userId
    );

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { profilePic: newImageUrl },
      { new: true, runValidators: true }
    ).select("-password");

    await deleteStoredProfileImage(userId, oldProfilePic);

    logger.info("Profile image updated successfully", {
      userId,
      newImageUrl,
      fileName: fileData.originalname,
    });

    return updatedUser;
  } catch (error) {
    logger.error("Failed to update profile image", {
      userId,
      fileName: fileData?.originalname,
      error: error.message,
    });
    throw error;
  }
};

// Goes back to the default avatar; the stored file is removed best-effort.
export const removeUserProfileImage = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const oldProfilePic = user.profilePic;
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { profilePic: DEFAULT_PROFILE_PIC },
      { new: true, runValidators: true }
    ).select("-password");

    await deleteStoredProfileImage(userId, oldProfilePic);

    logger.info("Profile image removed", { userId });
    return updatedUser;
  } catch (error) {
    logger.error("Failed to remove profile image", {
      userId,
      error: error.message,
    });
    throw error;
  }
};

export const getUserProfile = async (userId) => {
  try {
    const user = await User.findById(userId).select("-password");
    if (!user) {
      throw new Error("User not found");
    }

    logger.debug("User profile retrieved", { userId });
    return user;
  } catch (error) {
    logger.error("Failed to fetch user profile", {
      userId,
      error: error.message,
    });
    throw error;
  }
};

export const updateUserProfile = async (userId, updateData) => {
  try {
    const { password, profilePic, email, ...safeUpdateData } = updateData;

    const updatedUser = await User.findByIdAndUpdate(userId, safeUpdateData, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!updatedUser) {
      throw new Error("User not found");
    }

    logger.info("User profile updated successfully", {
      userId,
      updatedFields: Object.keys(safeUpdateData),
    });

    return updatedUser;
  } catch (error) {
    logger.error("Failed to update user profile", {
      userId,
      updateData: Object.keys(updateData),
      error: error.message,
    });
    throw error;
  }
};
