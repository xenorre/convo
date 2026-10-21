import logger from "#config/logger.js";
import { io } from "#config/socket.js";
import {
  acceptRequest,
  cancelRequest,
  declineRequest,
  FRIEND_ERRORS,
  listFriends,
  listRequests,
  removeFriend,
  searchUsers,
  sendRequest,
} from "#services/friend.service.js";
import { userRoom } from "#services/socket-session.service.js";
import { formatValidationError } from "#utils/format.js";
import { friendRequestSchema, userSearchSchema } from "#validations/friend.validation.js";

// Every response already carries `requestId` (the HTTP request, for logs),
// so friend request IDs are always named `friendRequestId`.
const ERROR_RESPONSES = {
  [FRIEND_ERRORS.SELF]: [400, "You can't add yourself"],
  [FRIEND_ERRORS.USER_NOT_FOUND]: [404, "User not found"],
  [FRIEND_ERRORS.ALREADY_FRIENDS]: [409, "You're already friends"],
  [FRIEND_ERRORS.ALREADY_REQUESTED]: [409, "A friend request is already pending"],
  [FRIEND_ERRORS.REQUEST_NOT_FOUND]: [404, "Friend request not found"],
  [FRIEND_ERRORS.NOT_FRIENDS]: [404, "You're not friends"],
  [FRIEND_ERRORS.NOT_ACCEPTING]: [403, "This person isn't accepting friend requests"],
};

const me = (req) => ({
  _id: String(req.user._id),
  fullName: req.user.fullName,
  profilePic: req.user.profilePic,
});

const notify = (userId, event, payload) => io.to(userRoom(String(userId))).emit(event, payload);

// Known friend errors become 4xx responses; anything else is a 500.
const handle = (action) => async (req, res) => {
  try {
    await action(req, res);
  } catch (error) {
    const known = ERROR_RESPONSES[error.message];
    if (known) {
      return res
        .status(known[0])
        .json({ error: known[1], code: error.message, requestId: req.requestId });
    }
    logger.error("Friend operation failed", {
      requestId: req.requestId,
      userId: req.user?.id,
      error: error.message,
    });
    res.status(500).json({ error: "Internal server error", requestId: req.requestId });
  }
};

const invalid = (req, res, error) =>
  res.status(400).json({
    error: "Validation failed",
    details: formatValidationError(error),
    requestId: req.requestId,
  });

const toRequest = (request, user) => ({
  friendRequestId: String(request._id),
  user,
  createdAt: request.createdAt,
});

export const getFriends = handle(async (req, res) => {
  res.status(200).json({ friends: await listFriends(req.user._id), requestId: req.requestId });
});

export const getFriendRequests = handle(async (req, res) => {
  const { incoming, outgoing } = await listRequests(req.user._id);
  const rename = ({ _id, ...rest }) => ({ friendRequestId: _id, ...rest });
  res.status(200).json({
    incoming: incoming.map(rename),
    outgoing: outgoing.map(rename),
    requestId: req.requestId,
  });
});

export const createFriendRequest = handle(async (req, res) => {
  const parsed = friendRequestSchema.safeParse(req.body);
  if (!parsed.success) return invalid(req, res, parsed.error);

  const result = await sendRequest(req.user._id, parsed.data.userId);
  const { target } = result;

  if (result.status === "accepted") {
    // They had already invited us, so this completes the friendship.
    const friendRequestId = String(result.friendship._id);
    notify(target._id, "friend:accepted", { friendRequestId, friend: me(req) });
    return res
      .status(200)
      .json({ status: "accepted", friendRequestId, friend: target, requestId: req.requestId });
  }

  notify(target._id, "friend:request", { request: toRequest(result.request, me(req)) });
  res.status(201).json({
    status: "requested",
    request: toRequest(result.request, target),
    requestId: req.requestId,
  });
});

export const acceptFriendRequest = handle(async (req, res) => {
  const friendship = await acceptRequest(req.user._id, req.params.id);
  const friendRequestId = String(friendship._id);
  notify(friendship.requester, "friend:accepted", { friendRequestId, friend: me(req) });
  res.status(200).json({ status: "accepted", friendRequestId, requestId: req.requestId });
});

export const declineFriendRequest = handle(async (req, res) => {
  const request = await declineRequest(req.user._id, req.params.id);
  notify(request.requester, "friend:request:removed", { friendRequestId: String(request._id) });
  res.status(200).json({ status: "declined", requestId: req.requestId });
});

export const cancelFriendRequest = handle(async (req, res) => {
  const request = await cancelRequest(req.user._id, req.params.id);
  notify(request.recipient, "friend:request:removed", { friendRequestId: String(request._id) });
  res.status(200).json({ status: "cancelled", requestId: req.requestId });
});

export const deleteFriend = handle(async (req, res) => {
  await removeFriend(req.user._id, req.params.userId);
  notify(req.params.userId, "friend:removed", { userId: String(req.user._id) });
  res.status(200).json({ status: "removed", requestId: req.requestId });
});

export const searchForUsers = handle(async (req, res) => {
  const parsed = userSearchSchema.safeParse(req.query);
  if (!parsed.success) return invalid(req, res, parsed.error);

  res.status(200).json({
    users: await searchUsers(req.user._id, parsed.data.q),
    requestId: req.requestId,
  });
});
