import mongoose from "mongoose";
import ChatDeletion from "#src/models/chatDeletion.model.js";
import Message from "#src/models/message.model.js";
import User from "#src/models/user.model.js";
import { deleteFile } from "#src/services/storage.service.js";
import logger from "#src/config/logger.js";

// Long messages are only needed in full inside the conversation view.
export const LAST_MESSAGE_PREVIEW_LENGTH = 120;

const toObjectId = (id) =>
  id instanceof mongoose.Types.ObjectId
    ? id
    : new mongoose.Types.ObjectId(String(id));

export const CHAT_ERRORS = Object.freeze({
  SELF: "CHAT_SELF",
});

// Messages between the two people, in either direction.
const betweenPair = (a, b) => ({
  $or: [
    { senderId: a, receiverId: b },
    { senderId: b, receiverId: a },
  ],
});

// The chats this user deleted, as { peerId, deletedBefore }.
export const getChatDeletions = (userId) =>
  ChatDeletion.find({ userId }).select("peerId deletedBefore").lean();

// Messages up to this date are deleted for the user, or null if none are.
export const getChatDeletedBefore = async (userId, peerId) =>
  (await ChatDeletion.findOne({ userId, peerId }).select("deletedBefore").lean())?.deletedBefore ?? null;

// One pass over the user's messages, done inside MongoDB: group them by chat
// partner, keep the newest message and count unread ones, then join the
// partner's public profile. Nothing but one row per partner leaves the database.
// Messages from chats the user deleted, or deleted by them one by one, are
// skipped before anything is grouped.
export const buildChatSummariesPipeline = (userId, deletions = []) => {
  const myId = toObjectId(userId);
  const skipDeleted = deletions.length
    ? [{
        $match: {
          $nor: deletions.map(({ peerId, deletedBefore }) => ({
            $or: [{ senderId: toObjectId(peerId) }, { receiverId: toObjectId(peerId) }],
            createdAt: { $lte: deletedBefore },
          })),
        },
      }]
    : [];

  return [
    { $match: { $or: [{ senderId: myId }, { receiverId: myId }], hiddenFor: { $ne: myId } } },
    ...skipDeleted,
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
            deletedAt: "$deletedAt",
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
                  // A message deleted for everyone no longer waits to be read.
                  { $eq: [{ $ifNull: ["$deletedAt", null] }, null] },
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
          deleted: { $ne: [{ $ifNull: ["$lastMessage.deletedAt", null] }, null] },
        },
      },
    },
  ];
};

// Chats come back newest first. unreadCounts keeps the shape clients already use.
export const getChatSummaries = async (userId) => {
  const deletions = await getChatDeletions(userId);
  const rows = await Message.aggregate(buildChatSummariesPipeline(userId, deletions));

  const unreadCounts = {};
  const chats = rows.map(({ unreadCount, ...chat }) => {
    if (unreadCount > 0) unreadCounts[String(chat._id)] = unreadCount;
    return chat;
  });

  return { chats, unreadCounts };
};

// Removes the messages both people deleted, with their attachments. Files go
// after the documents, so a storage failure leaves an orphaned file at worst,
// never a message pointing at a missing one.
const purgeMessagesDeletedByBoth = async (userId, peerId) => {
  const deletions = await ChatDeletion.find({
    $or: [
      { userId, peerId },
      { userId: peerId, peerId: userId },
    ],
  }).lean();
  if (deletions.length < 2) return 0;

  const cutoff = new Date(Math.min(...deletions.map(({ deletedBefore }) => deletedBefore.getTime())));
  const filter = { ...betweenPair(userId, peerId), createdAt: { $lte: cutoff } };
  const files = await Message.find({ ...filter, image: { $nin: [null, ""] } }).distinct("image");
  const { deletedCount } = await Message.deleteMany(filter);

  const results = await Promise.allSettled(files.map((fileUrl) => deleteFile(fileUrl)));
  const failed = results.filter(({ status }) => status === "rejected").length;
  if (failed) logger.warn("Some deleted chat attachments stayed in storage", { failed, total: files.length });
  return deletedCount;
};

// Deletes the whole chat history with `peerId` for this user. The other
// person keeps their copy until they delete the chat too.
export const deleteChatForUser = async (userId, peerId) => {
  if (String(userId) === String(peerId)) throw new Error(CHAT_ERRORS.SELF);

  const deletedBefore = new Date();
  await ChatDeletion.updateOne(
    { userId, peerId },
    { $set: { deletedBefore } },
    { upsert: true }
  );
  const purged = await purgeMessagesDeletedByBoth(userId, peerId);
  return { deletedBefore, purged };
};
