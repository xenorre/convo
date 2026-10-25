import Friendship, { friendPairKey } from "#src/models/friendship.model.js";
import User from "#src/models/user.model.js";
import Message from "#src/models/message.model.js";
import logger from "#config/logger.js";
import { blockedPeerIds, isBlockedBetween, privacyOf } from "#services/privacy.service.js";

const PUBLIC_USER_FIELDS = "fullName profilePic";
export const SEARCH_LIMIT = 20;

export const FRIEND_ERRORS = Object.freeze({
  SELF: "FRIEND_SELF",
  USER_NOT_FOUND: "FRIEND_USER_NOT_FOUND",
  ALREADY_FRIENDS: "FRIEND_ALREADY_FRIENDS",
  ALREADY_REQUESTED: "FRIEND_ALREADY_REQUESTED",
  REQUEST_NOT_FOUND: "FRIEND_REQUEST_NOT_FOUND",
  NOT_FRIENDS: "FRIEND_NOT_FRIENDS",
  // A block (either way) or "nobody" in their privacy settings; deliberately
  // one error so a block cannot be told apart from the setting.
  NOT_ACCEPTING: "FRIEND_NOT_ACCEPTING",
});

const publicUser = (user) => ({
  _id: String(user._id),
  fullName: user.fullName,
  profilePic: user.profilePic,
});

const isSameUser = (a, b) => String(a?._id ?? a) === String(b?._id ?? b);

// The populated user on the other side of a friendship.
const otherSide = (friendship, userId) =>
  isSameUser(friendship.requester, userId) ? friendship.recipient : friendship.requester;

// A deleted account counts as missing: nobody can befriend it.
const loadPublicUser = (userId) =>
  User.findOne({ _id: userId, deletedAt: null }).select(`${PUBLIC_USER_FIELDS} privacy`).lean();

export const listFriends = async (userId) => {
  const friendships = await Friendship.find({
    status: "accepted",
    $or: [{ requester: userId }, { recipient: userId }],
  })
    .populate("requester", PUBLIC_USER_FIELDS)
    .populate("recipient", PUBLIC_USER_FIELDS)
    .lean();

  return friendships
    .map((friendship) => ({ friendship, other: otherSide(friendship, userId) }))
    // A deleted account populates as null.
    .filter(({ other }) => other)
    .map(({ friendship, other }) => ({
      ...publicUser(other),
      since: friendship.respondedAt ?? friendship.updatedAt,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
};

export const listRequests = async (userId) => {
  const pending = await Friendship.find({
    status: "pending",
    $or: [{ requester: userId }, { recipient: userId }],
  })
    .populate("requester", PUBLIC_USER_FIELDS)
    .populate("recipient", PUBLIC_USER_FIELDS)
    .sort({ createdAt: -1 })
    .lean();

  const incoming = [];
  const outgoing = [];
  for (const request of pending) {
    const other = otherSide(request, userId);
    if (!other) continue;
    const entry = { _id: String(request._id), user: publicUser(other), createdAt: request.createdAt };
    (isSameUser(request.recipient, userId) ? incoming : outgoing).push(entry);
  }
  return { incoming, outgoing };
};

const accept = (requestId, filter = {}) =>
  Friendship.findOneAndUpdate(
    { _id: requestId, status: "pending", ...filter },
    { $set: { status: "accepted", respondedAt: new Date() } },
    { returnDocument: "after" }
  ).lean();

// Returns { status: "requested", request, target } or, when the other person
// had already invited us, { status: "accepted", friendship, target }.
export const sendRequest = async (userId, targetId) => {
  if (isSameUser(userId, targetId)) throw new Error(FRIEND_ERRORS.SELF);

  const target = await loadPublicUser(targetId);
  if (!target) throw new Error(FRIEND_ERRORS.USER_NOT_FOUND);

  const pairKey = friendPairKey(userId, targetId);
  const existing = await Friendship.findOne({ pairKey }).lean();
  if (existing?.status === "accepted") throw new Error(FRIEND_ERRORS.ALREADY_FRIENDS);
  if (existing && isSameUser(existing.requester, userId)) {
    throw new Error(FRIEND_ERRORS.ALREADY_REQUESTED);
  }
  if (existing) {
    // Both people want this: accept their pending request instead.
    const friendship = await accept(existing._id);
    if (!friendship) throw new Error(FRIEND_ERRORS.ALREADY_REQUESTED);
    return { status: "accepted", friendship, target: publicUser(target) };
  }

  if (
    privacyOf(target).allowFriendRequestsFrom === "nobody" ||
    (await isBlockedBetween(userId, targetId))
  ) {
    throw new Error(FRIEND_ERRORS.NOT_ACCEPTING);
  }

  try {
    const request = await Friendship.create({ requester: userId, recipient: targetId, pairKey });
    return { status: "requested", request, target: publicUser(target) };
  } catch (error) {
    // Two simultaneous requests for the same pair: the unique key keeps one.
    if (error?.code === 11000) throw new Error(FRIEND_ERRORS.ALREADY_REQUESTED);
    throw error;
  }
};

// Only the recipient can answer; returns the friendship and the requester.
export const acceptRequest = async (userId, requestId) => {
  const friendship = await accept(requestId, { recipient: userId });
  if (!friendship) throw new Error(FRIEND_ERRORS.REQUEST_NOT_FOUND);
  return friendship;
};

export const declineRequest = async (userId, requestId) => {
  const request = await Friendship.findOneAndDelete({
    _id: requestId,
    recipient: userId,
    status: "pending",
  }).lean();
  if (!request) throw new Error(FRIEND_ERRORS.REQUEST_NOT_FOUND);
  return request;
};

export const cancelRequest = async (userId, requestId) => {
  const request = await Friendship.findOneAndDelete({
    _id: requestId,
    requester: userId,
    status: "pending",
  }).lean();
  if (!request) throw new Error(FRIEND_ERRORS.REQUEST_NOT_FOUND);
  return request;
};

export const removeFriend = async (userId, friendId) => {
  const friendship = await Friendship.findOneAndDelete({
    pairKey: friendPairKey(userId, friendId),
    status: "accepted",
  }).lean();
  if (!friendship) throw new Error(FRIEND_ERRORS.NOT_FRIENDS);
  return friendship;
};

// How `userId` relates to each of `otherIds`: "friends", "outgoing" (we
// invited them), "incoming" (they invited us) or "none".
export const getRelationships = async (userId, otherIds) => {
  const keys = otherIds.map((otherId) => friendPairKey(userId, otherId));
  const friendships = await Friendship.find({ pairKey: { $in: keys } }).lean();
  const byKey = new Map(friendships.map((friendship) => [friendship.pairKey, friendship]));

  return new Map(
    otherIds.map((otherId) => {
      const friendship = byKey.get(friendPairKey(userId, otherId));
      if (!friendship) return [String(otherId), { state: "none" }];
      if (friendship.status === "accepted") return [String(otherId), { state: "friends" }];
      const state = isSameUser(friendship.requester, userId) ? "outgoing" : "incoming";
      return [String(otherId), { state, friendRequestId: String(friendship._id) }];
    })
  );
};

// One-off migration to the friends model: everyone who already exchanged a
// message becomes friends, so nobody loses access to their chats. Running it
// again only adds pairs that are new; existing relationships stay untouched.
export const migrateChatPartnersToFriends = async ({ batchSize = 1000 } = {}) => {
  const pairs = await Message.aggregate([
    { $match: { $expr: { $ne: ["$senderId", "$receiverId"] } } },
    {
      $group: {
        _id: {
          a: { $min: ["$senderId", "$receiverId"] },
          b: { $max: ["$senderId", "$receiverId"] },
        },
        firstMessageAt: { $min: "$createdAt" },
      },
    },
  ]).allowDiskUse(true);

  const userIds = [...new Set(pairs.flatMap(({ _id }) => [String(_id.a), String(_id.b)]))];
  const existing = new Set(
    (await User.find({ _id: { $in: userIds } }).distinct("_id")).map(String)
  );
  const livePairs = pairs.filter(
    ({ _id }) => existing.has(String(_id.a)) && existing.has(String(_id.b))
  );

  let created = 0;
  for (let start = 0; start < livePairs.length; start += batchSize) {
    const operations = livePairs.slice(start, start + batchSize).map(({ _id, firstMessageAt }) => {
      const pairKey = friendPairKey(_id.a, _id.b);
      return {
        updateOne: {
          filter: { pairKey },
          update: {
            $setOnInsert: {
              requester: _id.a,
              recipient: _id.b,
              pairKey,
              status: "accepted",
              respondedAt: firstMessageAt,
            },
          },
          upsert: true,
        },
      };
    });
    try {
      const result = await Friendship.bulkWrite(operations, { ordered: false });
      created += result.upsertedCount;
    } catch (error) {
      // A pair that became friends through the API meanwhile hits the unique
      // key; that is fine. Anything else is a real failure.
      const writeErrors = error?.writeErrors ?? [];
      if (!writeErrors.length || writeErrors.some((e) => (e.code ?? e.err?.code) !== 11000)) throw error;
      created += error.result?.upsertedCount ?? error.result?.nUpserted ?? 0;
    }
  }

  return {
    conversations: pairs.length,
    skippedDeletedUsers: pairs.length - livePairs.length,
    created,
  };
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Case-insensitive match anywhere in the name. Emails are never returned
// or searched, so the results reveal names only. People on either side of a
// block never see each other here.
export const searchUsers = async (userId, query) => {
  const users = await User.find({
    _id: { $nin: [userId, ...(await blockedPeerIds(userId))] },
    // null also matches accounts saved before deletedAt existed.
    deletedAt: null,
    fullName: { $regex: escapeRegex(query), $options: "i" },
  })
    .select(`${PUBLIC_USER_FIELDS} privacy`)
    .sort({ fullName: 1 })
    .limit(SEARCH_LIMIT)
    .lean();

  const relationships = await getRelationships(userId, users.map((user) => user._id));
  logger.debug("User search", { userId, results: users.length });

  return users.map((user) => {
    const relationship = relationships.get(String(user._id));
    const privacy = privacyOf(user);
    return {
      ...publicUser(user),
      relationship,
      // What the UI may offer; the server checks again when it happens.
      canRequest: relationship.state === "none" && privacy.allowFriendRequestsFrom !== "nobody",
      canMessage: relationship.state === "friends" || privacy.allowMessagesFrom === "everyone",
    };
  });
};
