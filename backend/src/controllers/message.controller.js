import User from "#src/models/user.model.js";
import Message from "#src/models/message.model.js";
import { uploadMessageFile } from "#src/services/storage.service.js";
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
    });

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

    // Emit to the user's room for cross-instance delivery
    io.to(`user:${receiverId}`).emit("newMessage", {
      message: newMessage,
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

export const getChats = async (req, res) => {
  try {
    const myId = req.user._id;

    const messages = await Message.find({
      $or: [{ senderId: myId }, { receiverId: myId }],
    });

    const chatPartnersIds = [
      ...new Set(
        messages.map((msg) =>
          msg.senderId.toString() === myId.toString()
            ? msg.receiverId.toString()
            : msg.senderId.toString()
        )
      ),
    ];

    const chatPartners = await User.find({
      _id: { $in: chatPartnersIds },
    }).select("-password -email -createdAt -updatedAt");

    res.status(200).json({
      chats: chatPartners,
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
