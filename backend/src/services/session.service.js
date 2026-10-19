import { randomUUID } from "node:crypto";
import User from "#models/user.model.js";

export const SESSION_REVOKED = Object.freeze({
  code: "SESSION_REVOKED",
  message:
    "You have been signed out because your account was signed in on another device.",
});

export const createSessionId = () => randomUUID();

export const hasActiveSession = (user, sessionId) =>
  typeof sessionId === "string" &&
  sessionId.length > 0 &&
  user?.activeSessionId === sessionId;

export const activateSession = async (userId, sessionId) => {
  // Return the previous value from the same atomic write. Concurrent logins
  // must revoke only their predecessor, never whichever session is newest.
  const previousUser = await User.findByIdAndUpdate(
    userId,
    { $set: { activeSessionId: sessionId } },
    { new: false }
  ).select("+activeSessionId");

  if (!previousUser) throw new Error("User not found");
  return previousUser.activeSessionId;
};

export const endSession = async (userId, sessionId) => {
  if (typeof sessionId !== "string" || !sessionId) return false;

  // A delayed sign-out from an old device must never end a newer session.
  const result = await User.updateOne(
    { _id: userId, activeSessionId: sessionId },
    { $unset: { activeSessionId: 1 } }
  );
  return result.modifiedCount > 0;
};

export const isSessionActive = async (userId, sessionId) => {
  if (typeof sessionId !== "string" || !sessionId) return false;
  return Boolean(await User.exists({ _id: userId, activeSessionId: sessionId }));
};

export const publicSessionUser = (user) => {
  const result = user.toObject();
  delete result.activeSessionId;
  delete result.password;
  result.id = String(user._id);
  return result;
};
