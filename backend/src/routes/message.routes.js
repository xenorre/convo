import {
  getAllContacts,
  getChats,
  getMessagesById,
  sendMessage,
} from "#src/controllers/message.controller.js";
import { protectRoute } from "#src/middleware/auth.middleware.js";
import {
  uploadMessageFile,
  handleMessageFileError,
  validateMessageFile,
} from "#src/middleware/messageUpload.middleware.js";
import { validateObjectIdParam } from "#src/middleware/objectId.middleware.js";
import express from "express";

const router = express.Router();

router.use(protectRoute);

router.get("/contacts", getAllContacts);
router.get("/chats", getChats);
router.get("/:id", validateObjectIdParam("id"), getMessagesById);
router.post(
  "/send/:id",
  validateObjectIdParam("id"),
  uploadMessageFile,
  handleMessageFileError,
  validateMessageFile,
  sendMessage
);

export default router;
