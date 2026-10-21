import logger from "#config/logger.js";
import { broadcastOnlineUsers, io } from "#config/socket.js";
import User from "#src/models/user.model.js";
import {
  blockUser,
  getPrivacySettings,
  listBlocked,
  messagePermission,
  PRIVACY_ERRORS,
  unblockUser,
  updatePrivacySettings,
} from "#services/privacy.service.js";
import { userRoom } from "#services/socket-session.service.js";
import { formatValidationError } from "#utils/format.js";
import { privacyUpdateSchema } from "#validations/privacy.validation.js";

const ERROR_RESPONSES = {
  [PRIVACY_ERRORS.SELF]: [400, "You can't block yourself"],
  [PRIVACY_ERRORS.USER_NOT_FOUND]: [404, "User not found"],
  [PRIVACY_ERRORS.NOT_BLOCKED]: [404, "This person isn't blocked"],
};

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
    logger.error("Privacy operation failed", {
      requestId: req.requestId,
      userId: req.user?.id,
      error: error.message,
    });
    res.status(500).json({ error: "Internal server error", requestId: req.requestId });
  }
};

export const getSettings = handle(async (req, res) => {
  res.status(200).json({ privacy: await getPrivacySettings(req.user._id), requestId: req.requestId });
});

export const updateSettings = handle(async (req, res) => {
  const parsed = privacyUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: formatValidationError(parsed.error),
      requestId: req.requestId,
    });
  }

  const privacy = await updatePrivacySettings(req.user._id, parsed.data.privacy);
  if ("showOnlineStatus" in parsed.data.privacy) {
    broadcastOnlineUsers().catch((error) =>
      logger.error("Presence update (privacy) failed", { error: error.message })
    );
  }
  res.status(200).json({ privacy, requestId: req.requestId });
});

// Lets a conversation show why it can't be written in. A block on their
// side reads as "UNAVAILABLE" so it cannot be told apart from other reasons.
export const getMessaging = handle(async (req, res) => {
  const receiver = await User.findById(req.params.id).select("privacy").lean();
  if (!receiver) throw new Error(PRIVACY_ERRORS.USER_NOT_FOUND);

  const permission = await messagePermission(req.user._id, receiver);
  res.status(200).json(
    permission.allowed
      ? { canMessage: true, requestId: req.requestId }
      : {
          canMessage: false,
          reason: permission.reason === "FRIENDS_ONLY" ? "FRIENDS_ONLY" : "UNAVAILABLE",
          requestId: req.requestId,
        }
  );
});

export const getBlocked = handle(async (req, res) => {
  res.status(200).json({ users: await listBlocked(req.user._id), requestId: req.requestId });
});

export const block = handle(async (req, res) => {
  const targetId = req.params.id;
  const ended = await blockUser(req.user._id, targetId);

  // The other person only sees the friendship or request end, as after an
  // unfriend or a declined request.
  if (ended?.status === "accepted") {
    io.to(userRoom(targetId)).emit("friend:removed", { userId: String(req.user._id) });
  } else if (ended) {
    io.to(userRoom(targetId)).emit("friend:request:removed", { friendRequestId: String(ended._id) });
  }

  res.status(200).json({
    status: "blocked",
    // Lets this client drop the matching request or friend right away.
    endedFriendRequestId: ended?.status === "pending" ? String(ended._id) : null,
    requestId: req.requestId,
  });
});

export const unblock = handle(async (req, res) => {
  await unblockUser(req.user._id, req.params.id);
  res.status(200).json({ status: "unblocked", requestId: req.requestId });
});
