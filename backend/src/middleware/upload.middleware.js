import multer from "multer";
import logger from "#config/logger.js";

// File type validation
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Configure multer for memory storage with limits
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Check file type
  if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    const error = new Error(
      "Invalid file type. Only JPEG, PNG, and WebP images are allowed."
    );
    error.code = "INVALID_FILE_TYPE";
    return cb(error, false);
  }

  // Additional validation can be added here
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1, // Only allow single file upload
  },
});

// Error handling middleware for multer
export const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case "LIMIT_FILE_SIZE":
        return res.status(400).json({
          error: "File too large",
          message: `File size must be less than ${
            MAX_FILE_SIZE / 1024 / 1024
          }MB`,
        });
      case "LIMIT_FILE_COUNT":
        return res.status(400).json({
          error: "Too many files",
          message: "Only one file is allowed",
        });
      case "LIMIT_UNEXPECTED_FILE":
        return res.status(400).json({
          error: "Unexpected field",
          message: "Unexpected file field",
        });
      default:
        return res.status(400).json({
          error: "File upload error",
          message: error.message,
        });
    }
  }

  if (error && error.code === "INVALID_FILE_TYPE") {
    return res.status(400).json({
      error: "Invalid file type",
      message: error.message,
    });
  }

  // Log unexpected errors
  if (error) {
    logger.error("Unexpected multer error:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: "Something went wrong with file upload",
    });
  }

  next();
};

export const uploadSingle = upload.single("profileImage");

export const validateFileUpload = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      error: "No file provided",
      message: "Please select an image to upload",
    });
  }

  if (req.file.size === 0) {
    return res.status(400).json({
      error: "Empty file",
      message: "The uploaded file is empty",
    });
  }

  next();
};
