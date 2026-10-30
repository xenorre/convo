import { z } from "zod";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "#services/storage.service.js";

// Validation schema for profile updates
export const updateProfileSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Full name must be at least 2 characters")
      .max(50, "Full name must be less than 50 characters")
      .optional(),
  })
  .strict();

// File validation constants
export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Enter your password").max(1024),
}).strict();

export const changeEmailSchema = z.object({
  // Trimmed before the format check, which would refuse surrounding spaces.
  newEmail: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address").max(254)),
  password: z.string().min(1, "Enter your password").max(1024),
}).strict();

export const FILE_VALIDATION = {
  MAX_SIZE: MAX_UPLOAD_BYTES,
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
      `The file must be ${MAX_UPLOAD_LABEL} or smaller`
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
