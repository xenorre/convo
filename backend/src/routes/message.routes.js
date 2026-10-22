import {
  deleteChat,
  deleteMessage,
  editMessage,
  getChats,
  getMessagesById,
  sendMessage,
  markRead,
} from "#src/controllers/message.controller.js";
import { protectRoute } from "#src/middleware/auth.middleware.js";
import {
  uploadMessageFile,
  handleMessageFileError,
  validateMessageFile,
} from "#src/middleware/messageUpload.middleware.js";
import { validateObjectIdParam } from "#src/middleware/objectId.middleware.js";
import { rateLimitPerUser } from "#src/middleware/rateLimit.middleware.js";
import express from "express";

const router = express.Router();

router.use(protectRoute);

router.get("/chats", getChats);
router.delete(
  "/chats/:id",
  validateObjectIdParam("id"),
  rateLimitPerUser({ windowMs: 10 * 60 * 1000, max: 30 }),
  deleteChat
);
router.get("/:id", validateObjectIdParam("id"), getMessagesById);

// A single message, by its own ID (the routes above take a user ID).
const messageChangeLimit = rateLimitPerUser({ windowMs: 60 * 1000, max: 60 });
router.patch("/item/:id", validateObjectIdParam("id"), messageChangeLimit, editMessage);
router.delete("/item/:id", validateObjectIdParam("id"), messageChangeLimit, deleteMessage);
router.post("/mark-read/:id", validateObjectIdParam("id"), markRead);
router.post(
  "/send/:id",
  validateObjectIdParam("id"),
  uploadMessageFile,
  handleMessageFileError,
  validateMessageFile,
  sendMessage
);

export default router;
