import multer from "multer";
import logger from "#config/logger.js";

// File type validation for messages - support more file types
const ALLOWED_MESSAGE_FILE_TYPES = [
  // Images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Text files
  "text/plain",
  // Videos (small ones)
  "video/mp4",
  "video/webm",
];

const MAX_MESSAGE_FILE_SIZE = 10 * 1024 * 1024; // 10MB for messages

// Configure multer for memory storage
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Check file type
  if (!ALLOWED_MESSAGE_FILE_TYPES.includes(file.mimetype)) {
    const error = new Error(
      "Invalid file type. Allowed types: images, PDFs, documents, text files, and small videos."
    );
    error.code = "INVALID_FILE_TYPE";
    return cb(error, false);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_MESSAGE_FILE_SIZE,
    files: 1, // Only allow single file per message
  },
});

// Error handling middleware for multer
export const handleMessageFileError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case "LIMIT_FILE_SIZE":
        return res.status(400).json({
          error: "File too large",
          message: `File size must be less than ${
            MAX_MESSAGE_FILE_SIZE / 1024 / 1024
          }MB`,
        });
      case "LIMIT_FILE_COUNT":
        return res.status(400).json({
          error: "Too many files",
          message: "Only one file per message is allowed",
        });
      case "LIMIT_UNEXPECTED_FILE":
        return res.status(400).json({
          error: "Unexpected field",
          message: "Unexpected file field name. Use 'messageFile'",
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

  if (error) {
    logger.error("Unexpected message file upload error:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: "Something went wrong with file upload",
    });
  }

  next();
};

export const uploadMessageFile = upload.single("messageFile");

export const validateMessageFile = (req, res, next) => {
  // File is optional for messages (can send text only)
  if (!req.file && !req.body.text) {
    return res.status(400).json({
      error: "Empty message",
      message: "Please provide either text or a file",
    });
  }

  if (req.file && req.file.size === 0) {
    return res.status(400).json({
      error: "Empty file",
      message: "The uploaded file is empty",
    });
  }

  next();
};
