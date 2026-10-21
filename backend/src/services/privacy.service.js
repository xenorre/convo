import Block from "#src/models/block.model.js";
import Friendship, { friendPairKey } from "#src/models/friendship.model.js";
import Message from "#src/models/message.model.js";
import User from "#src/models/user.model.js";

const PUBLIC_USER_FIELDS = "fullName profilePic";

export const PRIVACY_DEFAULTS = Object.freeze({
  allowMessagesFrom: "friends",
  allowFriendRequestsFrom: "everyone",
  showOnlineStatus: true,
});

export const PRIVACY_ERRORS = Object.freeze({
  SELF: "PRIVACY_SELF",
  USER_NOT_FOUND: "PRIVACY_USER_NOT_FOUND",
  NOT_BLOCKED: "PRIVACY_NOT_BLOCKED",
});

// Settings with defaults filled in, for documents saved before they existed.
export const privacyOf = (user) => {
  const stored = user?.privacy?.toObject?.() ?? user?.privacy ?? {};
  return {
    allowMessagesFrom: stored.allowMessagesFrom ?? PRIVACY_DEFAULTS.allowMessagesFrom,
    allowFriendRequestsFrom: stored.allowFriendRequestsFrom ?? PRIVACY_DEFAULTS.allowFriendRequestsFrom,
    showOnlineStatus: stored.showOnlineStatus ?? PRIVACY_DEFAULTS.showOnlineStatus,
  };
};

export const getPrivacySettings = async (userId) => {
  const user = await User.findById(userId).select("privacy").lean();
  if (!user) throw new Error(PRIVACY_ERRORS.USER_NOT_FOUND);
  return privacyOf(user);
};

export const updatePrivacySettings = async (userId, changes) => {
  const $set = Object.fromEntries(
    Object.entries(changes).map(([key, value]) => [`privacy.${key}`, value])
  );
  const user = await User.findByIdAndUpdate(userId, { $set }, { new: true, runValidators: true })
    .select("privacy")
    .lean();
  if (!user) throw new Error(PRIVACY_ERRORS.USER_NOT_FOUND);
  return privacyOf(user);
};

export const isBlockedBetween = async (a, b) =>
  Boolean(
    await Block.exists({
      $or: [
        { blocker: a, blocked: b },
        { blocker: b, blocked: a },
      ],
    })
  );

// Everyone this user blocked or was blocked by; they stay out of each
// other's search results.
export const blockedPeerIds = async (userId) => {
  const blocks = await Block.find({ $or: [{ blocker: userId }, { blocked: userId }] }).lean();
  return blocks.map((block) =>
    String(block.blocker) === String(userId) ? block.blocked : block.blocker
  );
};

export const listBlocked = async (userId) => {
  const blocks = await Block.find({ blocker: userId })
    .populate("blocked", PUBLIC_USER_FIELDS)
    .sort({ createdAt: -1 })
    .lean();
  return blocks
    .filter((block) => block.blocked)
    .map(({ blocked, createdAt }) => ({
      _id: String(blocked._id),
      fullName: blocked.fullName,
      profilePic: blocked.profilePic,
      blockedAt: createdAt,
    }));
};

// Blocking also ends any friendship or pending request between the two.
// Returns that relationship (or null) so the other side can be told it is
// gone, which looks the same as an unfriend and does not reveal the block.
export const blockUser = async (userId, targetId) => {
  if (String(userId) === String(targetId)) throw new Error(PRIVACY_ERRORS.SELF);
  if (!(await User.exists({ _id: targetId }))) throw new Error(PRIVACY_ERRORS.USER_NOT_FOUND);

  await Block.updateOne(
    { blocker: userId, blocked: targetId },
    { $setOnInsert: { blocker: userId, blocked: targetId } },
    { upsert: true }
  );
  return Friendship.findOneAndDelete({ pairKey: friendPairKey(userId, targetId) }).lean();
};

export const unblockUser = async (userId, targetId) => {
  const result = await Block.deleteOne({ blocker: userId, blocked: targetId });
  if (!result.deletedCount) throw new Error(PRIVACY_ERRORS.NOT_BLOCKED);
};

const areFriends = async (a, b) =>
  Boolean(await Friendship.exists({ pairKey: friendPairKey(a, b), status: "accepted" }));

const haveConversation = async (a, b) =>
  Boolean(
    await Message.exists({
      $or: [
        { senderId: a, receiverId: b },
        { senderId: b, receiverId: a },
      ],
    })
  );

// Whether `senderId` may send a message to `receiver` (a user document with
// its privacy settings). People who already talked can keep talking.
export const messagePermission = async (senderId, receiver) => {
  if (await isBlockedBetween(senderId, receiver._id)) return { allowed: false, reason: "BLOCKED" };
  if (privacyOf(receiver).allowMessagesFrom === "everyone") return { allowed: true };
  if (await areFriends(senderId, receiver._id)) return { allowed: true };
  if (await haveConversation(senderId, receiver._id)) return { allowed: true };
  return { allowed: false, reason: "FRIENDS_ONLY" };
};

// IDs among `userIds` that `userId` has exchanged at least one message with.
export const conversationPartnerIds = async (userId, userIds) => {
  const [sentTo, receivedFrom] = await Promise.all([
    Message.distinct("receiverId", { senderId: userId, receiverId: { $in: userIds } }),
    Message.distinct("senderId", { receiverId: userId, senderId: { $in: userIds } }),
  ]);
  return new Set([...sentTo, ...receivedFrom].map(String));
};

// The online list everyone receives, minus people who hide their status.
export const visibleOnlineUsers = async (userIds) => {
  if (!userIds.length) return [];
  const hidden = new Set(
    (
      await User.find({ _id: { $in: userIds }, "privacy.showOnlineStatus": false }).distinct("_id")
    ).map(String)
  );
  return userIds.filter((id) => !hidden.has(String(id)));
};
