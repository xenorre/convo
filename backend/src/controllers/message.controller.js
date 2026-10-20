import User from "#src/models/user.model.js";
import Message from "#src/models/message.model.js";
import { uploadMessageFile } from "#src/services/storage.service.js";
import { getChatSummaries } from "#src/services/chat.service.js";
import logger from "#src/config/logger.js";
import { io } from "#src/config/socket.js";

export const getAllContacts = async (req, res) => {
  try {
    const myId = req.user._id;
    const filteredUsers = await User.find({
      _id: { $ne: myId },
    }).select("-password -email -createdAt -updatedAt");

    res.status(200).json({
      users: filteredUsers,
      requestId: req.requestId,
    });
  } catch (e) {
    logger.error("Failed to fetch contacts", {
      requestId: req.requestId,
      error: e.message,
    });
    res
      .status(500)
      .json({ error: "Internal server error", requestId: req.requestId });
  }
};

export const getMessagesById = async (req, res) => {
  try {
    const myId = req.user._id;
    const { id: userToChatId } = req.params;

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
