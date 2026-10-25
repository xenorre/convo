import mongoose from "mongoose";
import Message from "#src/models/message.model.js";
import User from "#src/models/user.model.js";
import { getChatDeletedBefore } from "#src/services/chat.service.js";
import { messagePermission } from "#src/services/privacy.service.js";
import { deleteFile } from "#src/services/storage.service.js";
import logger from "#src/config/logger.js";

// The sender can change a message for this long after sending it.
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

export const MESSAGE_ERRORS = Object.freeze({
  NOT_FOUND: "MESSAGE_NOT_FOUND",
  NOT_SENDER: "MESSAGE_NOT_SENDER",
  DELETED: "MESSAGE_DELETED",
  EDIT_WINDOW_PASSED: "MESSAGE_EDIT_WINDOW_PASSED",
  EMPTY: "MESSAGE_EMPTY",
  FRIENDS_ONLY: "MESSAGE_FRIENDS_ONLY",
  NOT_ALLOWED: "MESSAGE_NOT_ALLOWED",
});

const sameId = (a, b) => String(a) === String(b);

// A conversation loads newest first, this many messages at a time.
export const MESSAGE_PAGE_SIZE = 30;
export const MESSAGE_PAGE_MAX = 50;

// Where the next (older) page starts: the oldest loaded message's time and
// id. A position rather than a page number, so messages arriving meanwhile
// don't shift what comes next. Opaque to the client.
export const encodeMessageCursor = (message) =>
  Buffer.from(`${new Date(message.createdAt).getTime()}:${message._id}`).toString("base64url");

// null when the cursor wasn't made by encodeMessageCursor.
export const decodeMessageCursor = (cursor) => {
  const [time, id, extra] = Buffer.from(String(cursor), "base64url").toString("utf8").split(":");
  if (extra !== undefined || !/^\d{1,15}$/.test(time ?? "") || !mongoose.isObjectIdOrHexString(id)) return null;
  return { createdAt: new Date(Number(time)), _id: new mongoose.Types.ObjectId(id) };
};

// One page of a conversation as `viewerId` sees it, oldest first, plus
// whether anything older is left. `before` is a decoded cursor or null for
// the newest page. Uses the { senderId|receiverId, createdAt, _id } indexes.
export const loadConversationPage = async (viewerId, peerId, { before = null, limit = MESSAGE_PAGE_SIZE } = {}) => {
  // A chat deleted earlier only shows what came after.
  const deletedBefore = await getChatDeletedBefore(viewerId, peerId);
  const newestFirst = await Message.find({
    $or: [
      { senderId: viewerId, receiverId: peerId },
      { senderId: peerId, receiverId: viewerId },
    ],
    hiddenFor: { $ne: viewerId },
    ...(deletedBefore && { createdAt: { $gt: deletedBefore } }),
    // Same time, lower id: messages saved in the same millisecond still page.
    ...(before && {
      $and: [{
        $or: [
          { createdAt: { $lt: before.createdAt } },
          { createdAt: before.createdAt, _id: { $lt: before._id } },
        ],
      }],
    }),
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1);

  const hasMore = newestFirst.length > limit;
  const messages = newestFirst.slice(0, limit).reverse();
  return { messages, hasMore, nextCursor: hasMore ? encodeMessageCursor(messages[0]) : null };
};

export const otherParticipant = (message, userId) =>
  sameId(message.senderId, userId) ? message.receiverId : message.senderId;

// Participants who still see the message, so updates only go to them.
export const viewersOf = (message) =>
  [message.senderId, message.receiverId].filter(
    (id) => !(message.hiddenFor ?? []).some((hidden) => sameId(hidden, id))
  );

// A message this user can see: theirs to read, not deleted for them alone,
// and not part of a chat they deleted.
const findVisibleMessage = async (userId, messageId) => {
  const message = await Message.findOne({
    _id: messageId,
    $or: [{ senderId: userId }, { receiverId: userId }],
    hiddenFor: { $ne: userId },
  });
  if (!message) throw new Error(MESSAGE_ERRORS.NOT_FOUND);

  const deletedBefore = await getChatDeletedBefore(userId, otherParticipant(message, userId));
  if (deletedBefore && message.createdAt <= deletedBefore) throw new Error(MESSAGE_ERRORS.NOT_FOUND);
  return message;
};

// Files go after the documents, so a storage failure leaves an orphaned
// file at worst, never a message pointing at a missing one.
export const removeFile = async (fileUrl) => {
  if (!fileUrl) return;
  try {
    await deleteFile(fileUrl);
  } catch (error) {
    logger.warn("A deleted message's file stayed in storage", { error: error.message });
  }
};

export const editMessage = async (userId, messageId, text, now = new Date()) => {
  const message = await findVisibleMessage(userId, messageId);
  if (!sameId(message.senderId, userId)) throw new Error(MESSAGE_ERRORS.NOT_SENDER);
  if (message.deletedAt) throw new Error(MESSAGE_ERRORS.DELETED);
  if (now - message.createdAt > EDIT_WINDOW_MS) throw new Error(MESSAGE_ERRORS.EDIT_WINDOW_PASSED);
  if (!text && !message.image) throw new Error(MESSAGE_ERRORS.EMPTY);
  if (text === (message.text ?? "")) return message;

  // Editing is writing to them, so it follows the same rules as sending.
  const receiver = await User.findById(message.receiverId).select("privacy deletedAt").lean();
  if (!receiver) throw new Error(MESSAGE_ERRORS.NOT_FOUND);
  const permission = await messagePermission(userId, receiver);
  if (!permission.allowed) {
    throw new Error(permission.reason === "FRIENDS_ONLY" ? MESSAGE_ERRORS.FRIENDS_ONLY : MESSAGE_ERRORS.NOT_ALLOWED);
  }

  // Checked again in the write, in case it was deleted or the window closed meanwhile.
  const updated = await Message.findOneAndUpdate(
    { _id: message._id, senderId: userId, deletedAt: null, createdAt: { $gte: new Date(now - EDIT_WINDOW_MS) } },
    text ? { $set: { text, editedAt: now } } : { $set: { editedAt: now }, $unset: { text: 1 } },
    { new: true }
  );
  if (!updated) throw new Error(MESSAGE_ERRORS.DELETED);
  return updated;
};

// Leaves a placeholder both people see. Deleting twice is harmless.
export const deleteMessageForEveryone = async (userId, messageId, now = new Date()) => {
  const message = await findVisibleMessage(userId, messageId);
  if (!sameId(message.senderId, userId)) throw new Error(MESSAGE_ERRORS.NOT_SENDER);
  if (message.deletedAt) return { message, wasUnread: false };

  const before = await Message.findOneAndUpdate(
    { _id: message._id, senderId: userId, deletedAt: null },
    { $set: { deletedAt: now }, $unset: { text: 1, image: 1, editedAt: 1 } },
    { new: false }
  );
  if (!before) return { message: await Message.findById(message._id), wasUnread: false };

  await removeFile(before.image);
  return { message: await Message.findById(message._id), wasUnread: before.readAt == null };
};

// Hides it from this user only. When the other person had already done the
// same, nobody can see it any more, so it is removed with its file.
export const deleteMessageForMe = async (userId, messageId) => {
  const message = await findVisibleMessage(userId, messageId);
  const peerId = otherParticipant(message, userId);

  const updated = await Message.findOneAndUpdate(
    { _id: message._id, hiddenFor: { $ne: userId } },
    { $addToSet: { hiddenFor: userId } },
    { new: true }
  );
  if (updated && updated.hiddenFor.some((id) => sameId(id, peerId))) {
    await Message.deleteOne({ _id: message._id });
    await removeFile(updated.image);
    return { messageId: String(message._id), peerId: String(peerId), purged: true };
  }
  return { messageId: String(message._id), peerId: String(peerId), purged: false };
};
