import { z } from "zod";

// Validation schema for profile updates
export const updateProfileSchema = z
  .object({
    fullName: z
      .string()
      .min(2, "Full name must be at least 2 characters")
      .max(50, "Full name must be less than 50 characters")
      .optional(),
  })
  .strict();

// File validation constants
export const FILE_VALIDATION = {
  MAX_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_TYPES: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
  ALLOWED_EXTENSIONS: [".jpg", ".jpeg", ".png", ".webp"],
};

// Custom validation for file uploads
export const validateImageFile = (file) => {
  const errors = [];

  if (!file) {
    errors.push("No file provided");
    return errors;
  }

  // Check file size
  if (file.size > FILE_VALIDATION.MAX_SIZE) {
    errors.push(
      `File size must be less than ${FILE_VALIDATION.MAX_SIZE / 1024 / 1024}MB`
    );
  }

  // Check file type
  if (!FILE_VALIDATION.ALLOWED_TYPES.includes(file.mimetype)) {
    errors.push(
      "Invalid file type. Only JPEG, PNG, and WebP images are allowed"
    );
  }

  // Check file extension
  const fileExtension = file.originalname.toLowerCase().split(".").pop();
  if (!FILE_VALIDATION.ALLOWED_EXTENSIONS.includes(`.${fileExtension}`)) {
    errors.push("Invalid file extension");
  }

  // Check if file is empty
  if (file.size === 0) {
    errors.push("File is empty");
  }

  return errors;
};
