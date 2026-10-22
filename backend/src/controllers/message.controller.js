import Message from "#src/models/message.model.js";
import User from "#src/models/user.model.js";
import { messagePermission } from "#src/services/privacy.service.js";
import { uploadMessageFile } from "#src/services/storage.service.js";
import {
  CHAT_ERRORS,
  deleteChatForUser,
  getChatDeletedBefore,
  getChatSummaries,
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
    const { chats, unreadCounts } = await getChatSummaries(req.user._id);

    res.status(200).json({
      chats,
      unreadCounts,
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
