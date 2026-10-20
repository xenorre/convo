import mongoose from "mongoose";
import Message from "#src/models/message.model.js";
import User from "#src/models/user.model.js";

// Long messages are only needed in full inside the conversation view.
export const LAST_MESSAGE_PREVIEW_LENGTH = 120;

const toObjectId = (id) =>
  id instanceof mongoose.Types.ObjectId
    ? id
    : new mongoose.Types.ObjectId(String(id));

// One pass over the user's messages, done inside MongoDB: group them by chat
// partner, keep the newest message and count unread ones, then join the
// partner's public profile. Nothing but one row per partner leaves the database.
export const buildChatSummariesPipeline = (userId) => {
  const myId = toObjectId(userId);

  return [
    { $match: { $or: [{ senderId: myId }, { receiverId: myId }] } },
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $group: {
        _id: {
          $cond: [{ $eq: ["$senderId", myId] }, "$receiverId", "$senderId"],
        },
        lastMessage: {
          $first: {
            _id: "$_id",
            senderId: "$senderId",
            text: "$text",
            image: "$image",
            createdAt: "$createdAt",
          },
        },
        unreadCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$receiverId", myId] },
                  // Older documents may not have readAt at all.
                  { $eq: [{ $ifNull: ["$readAt", null] }, null] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
    { $sort: { "lastMessage.createdAt": -1, "lastMessage._id": -1 } },
    {
      $lookup: {
        from: User.collection.name,
        localField: "_id",
        foreignField: "_id",
        as: "partner",
        pipeline: [{ $project: { fullName: 1, profilePic: 1 } }],
      },
    },
    // Partners whose account no longer exists are dropped, as before.
    { $unwind: "$partner" },
    {
      $project: {
        _id: "$partner._id",
        fullName: "$partner.fullName",
        profilePic: "$partner.profilePic",
        unreadCount: 1,
        lastMessage: {
          _id: "$lastMessage._id",
          senderId: "$lastMessage.senderId",
          text: {
            $substrCP: [
              { $ifNull: ["$lastMessage.text", ""] },
              0,
              LAST_MESSAGE_PREVIEW_LENGTH,
            ],
          },
          hasAttachment: {
            $gt: [{ $strLenCP: { $ifNull: ["$lastMessage.image", ""] } }, 0],
          },
          createdAt: "$lastMessage.createdAt",
        },
      },
    },
  ];
};

// Chats come back newest first. unreadCounts keeps the shape clients already use.
export const getChatSummaries = async (userId) => {
  const rows = await Message.aggregate(buildChatSummariesPipeline(userId));

  const unreadCounts = {};
  const chats = rows.map(({ unreadCount, ...chat }) => {
    if (unreadCount > 0) unreadCounts[String(chat._id)] = unreadCount;
    return chat;
  });

  return { chats, unreadCounts };
};
