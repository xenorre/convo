import Message from "#src/models/message.model.js";
import User from "#src/models/user.model.js";
import { messagePermission } from "#src/services/privacy.service.js";
import { uploadMessageFile } from "#src/services/storage.service.js";
import {
  MESSAGE_ERRORS,
  deleteMessageForEveryone,
  deleteMessageForMe,
  editMessage as editMessageText,
  viewersOf,
} from "#src/services/message.service.js";
import { chatMuteSchema, messageDeleteQuerySchema, messageEditSchema } from "#validations/message.validation.js";
import { formatValidationError } from "#src/utils/format.js";
import {
  CHAT_ERRORS,
  deleteChatForUser,
  getChatDeletedBefore,
  getChatSummaries,
  muteChat as muteChatFor,
  unmuteChat as unmuteChatFor,
} from "#src/services/chat.service.js";
import logger from "#src/config/logger.js";
import { io } from "#src/config/socket.js";

export const getMessagesById = async (req, res) => {
  try {
    const myId = req.user._id;
    const { id: userToChatId } = req.params;

    // A chat deleted earlier only shows what came after.
    const deletedBefore = await getChatDeletedBefore(myId, userToChatId);
    const message = await Message.find({
      $or: [
        {
          senderId: myId,
          receiverId: userToChatId,
        },
        {
          senderId: userToChatId,
          receiverId: myId,
        },
      ],
      hiddenFor: { $ne: myId },
      ...(deletedBefore && { createdAt: { $gt: deletedBefore } }),
    })
      // Without an explicit sort MongoDB returns index order, not chronology.
      .sort({ createdAt: 1, _id: 1 });

    res.status(200).json({
      messages: message,
      requestId: req.requestId,
    });
  } catch (e) {
    logger.error("Failed to fetch chats", {
      requestId: req.requestId,
      error: e.message,
    });
    res
      .status(500)
      .json({ error: "Internal server error", requestId: req.requestId });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    // Checked before any upload, so a refused message leaves no stored file.
    const receiver = await User.findById(receiverId).select("privacy").lean();
    if (!receiver) {
      return res.status(404).json({ error: "User not found", requestId: req.requestId });
    }
    const permission = await messagePermission(senderId, receiver);
    if (!permission.allowed) {
      // Their messaging setting is explained; a block only gets a generic refusal.
      return res.status(403).json(
        permission.reason === "FRIENDS_ONLY"
          ? { error: "Only their friends can message them", code: "MESSAGE_FRIENDS_ONLY", requestId: req.requestId }
          : { error: "You can't message this person", code: "MESSAGE_NOT_ALLOWED", requestId: req.requestId }
      );
    }

    let fileUrl;
    if (req.file) {
      // Upload file to message-files folder
      fileUrl = await uploadMessageFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        senderId,
        receiverId
      );

      logger.info("Message file uploaded successfully", {
        senderId,
        receiverId,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        fileUrl,
        requestId: req.requestId,
      });
    }

    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      image: fileUrl, // Store file URL in image field (can be renamed to 'file' later)
    });

    await newMessage.save();

    logger.info("Message sent successfully", {
      messageId: newMessage._id,
      senderId,
      receiverId,
      hasFile: !!fileUrl,
      requestId: req.requestId,
    });

    // Emit to the user's room for cross-instance delivery, include sender snapshot for UI
    io.to(`user:${receiverId}`).emit("newMessage", {
      message: newMessage,
      sender: {
        _id: req.user._id,
        fullName: req.user.fullName,
        profilePic: req.user.profilePic,
      },
    });

    logger.info("New message event emitted to receiver via Socket.IO", {
      receiverId,
      messageId: newMessage._id,
    });

    res.status(201).json({
      message: newMessage,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error("Failed to send message", {
      requestId: req.requestId,
      senderId: req.user?._id,
      receiverId: req.params?.id,
      error: error.message,
    });
    res
      .status(500)
      .json({ error: "Internal server error", requestId: req.requestId });
  }
};

export const markRead = async (req, res) => {
  try {
    const myId = req.user._id;
    const { id: senderId } = req.params;
    const result = await Message.updateMany(
      { receiverId: myId, senderId, readAt: null },
      { $set: { readAt: new Date() } }
    );
    res.status(200).json({ updated: result.modifiedCount || 0, requestId: req.requestId });
  } catch (e) {
    logger.error("Failed to mark messages as read", { requestId: req.requestId, error: e.message });
    res.status(500).json({ error: "Internal server error", requestId: req.requestId });
  }
};

export const getChats = async (req, res) => {
  try {
    const { chats, unreadCounts, mutes } = await getChatSummaries(req.user._id);

    res.status(200).json({
      chats,
      unreadCounts,
      mutes,
      requestId: req.requestId,
    });
  } catch (e) {
    logger.error("Failed to fetch chat partners", {
      requestId: req.requestId,
      error: e.message,
    });
    res
      .status(500)
      .json({ error: "Internal server error", requestId: req.requestId });
  }
};

export const deleteChat = async (req, res) => {
  try {
    const myId = req.user._id;
    const { id: peerId } = req.params;
    const { deletedBefore, purged } = await deleteChatForUser(myId, peerId);

    logger.info("Chat deleted", { userId: myId, peerId, purged, requestId: req.requestId });

    // The user's other tabs drop it too; the other person is not told.
    io.to(`user:${myId}`).emit("chat:deleted", { userId: peerId, deletedBefore });

    res.status(200).json({ userId: peerId, deletedBefore, requestId: req.requestId });
  } catch (e) {
    if (e.message === CHAT_ERRORS.SELF) {
      return res.status(400).json({ error: "You can't delete a chat with yourself", requestId: req.requestId });
    }
    logger.error("Failed to delete chat", { requestId: req.requestId, error: e.message });
    res.status(500).json({ error: "Internal server error", requestId: req.requestId });
  }
};

const MESSAGE_ERROR_RESPONSES = {
  [MESSAGE_ERRORS.NOT_FOUND]: [404, "Message not found"],
  [MESSAGE_ERRORS.NOT_SENDER]: [403, "You can only change your own messages"],
  [MESSAGE_ERRORS.DELETED]: [409, "This message was deleted"],
  [MESSAGE_ERRORS.EDIT_WINDOW_PASSED]: [409, "Messages can only be edited for 15 minutes after sending"],
  [MESSAGE_ERRORS.EMPTY]: [400, "A message needs text or a file"],
  // Same answers as sending, so a block still only gets a generic refusal.
  [MESSAGE_ERRORS.FRIENDS_ONLY]: [403, "Only their friends can message them"],
  [MESSAGE_ERRORS.NOT_ALLOWED]: [403, "You can't message this person"],
};

const sendMessageError = (req, res, e, action) => {
  const known = MESSAGE_ERROR_RESPONSES[e.message];
  if (known) {
    const [status, error] = known;
    return res.status(status).json({ error, code: e.message, requestId: req.requestId });
  }
  logger.error(`Failed to ${action} message`, { requestId: req.requestId, error: e.message });
  res.status(500).json({ error: "Internal server error", requestId: req.requestId });
};

const emitToViewers = (message, event, payload) => {
  for (const userId of viewersOf(message)) io.to(`user:${userId}`).emit(event, payload);
};

export const editMessage = async (req, res) => {
  const parsed = messageEditSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: formatValidationError(parsed.error),
      requestId: req.requestId,
    });
  }

  try {
    const message = await editMessageText(req.user._id, req.params.id, parsed.data.text);
    const json = message.toJSON();
    emitToViewers(message, "message:updated", { message: json });
    res.status(200).json({ message: json, requestId: req.requestId });
  } catch (e) {
    sendMessageError(req, res, e, "edit");
  }
};

export const deleteMessage = async (req, res) => {
  const parsed = messageDeleteQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: formatValidationError(parsed.error),
      requestId: req.requestId,
    });
  }

  try {
    if (parsed.data.for === "everyone") {
      const { message, wasUnread } = await deleteMessageForEveryone(req.user._id, req.params.id);
      const json = message.toJSON();
      emitToViewers(message, "message:deleted", { message: json, wasUnread });
      return res.status(200).json({ message: json, requestId: req.requestId });
    }

    const { messageId, peerId } = await deleteMessageForMe(req.user._id, req.params.id);
    // Only the user's own tabs; the other person is not told.
    io.to(`user:${req.user._id}`).emit("message:hidden", { messageId, peerId });
    res.status(200).json({ messageId, peerId, requestId: req.requestId });
  } catch (e) {
    sendMessageError(req, res, e, "delete");
  }
};

// Muting only changes what this user's own devices notify them about, so the
// other person is never told.
export const muteChat = async (req, res) => {
  const parsed = chatMuteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: formatValidationError(parsed.error),
      requestId: req.requestId,
    });
  }

  try {
    const { id: peerId } = req.params;
    const { mutedUntil } = await muteChatFor(req.user._id, peerId, parsed.data.duration);
    io.to(`user:${req.user._id}`).emit("chat:muted", { userId: peerId, mutedUntil });
    res.status(200).json({ userId: peerId, mutedUntil, requestId: req.requestId });
  } catch (e) {
    if (e.message === CHAT_ERRORS.SELF) {
      return res.status(400).json({ error: "You can't mute a chat with yourself", requestId: req.requestId });
    }
    logger.error("Failed to mute chat", { requestId: req.requestId, error: e.message });
    res.status(500).json({ error: "Internal server error", requestId: req.requestId });
  }
};

export const unmuteChat = async (req, res) => {
  try {
    const { id: peerId } = req.params;
    await unmuteChatFor(req.user._id, peerId);
    io.to(`user:${req.user._id}`).emit("chat:unmuted", { userId: peerId });
    res.status(200).json({ userId: peerId, requestId: req.requestId });
  } catch (e) {
    logger.error("Failed to unmute chat", { requestId: req.requestId, error: e.message });
    res.status(500).json({ error: "Internal server error", requestId: req.requestId });
  }
};
