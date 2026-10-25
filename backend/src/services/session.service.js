import { randomUUID } from "node:crypto";
import User from "#models/user.model.js";

export const SESSION_REVOKED = Object.freeze({
  code: "SESSION_REVOKED",
  message:
    "You have been signed out because your account was signed in on another device.",
});

export const ACCOUNT_DELETED = Object.freeze({
  code: "ACCOUNT_DELETED",
  message: "This account was deleted.",
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

// Replaces the session only if it is still the active one, so a request
// from a session that was just signed out cannot take the account back.
// `extraUpdate` is applied in the same atomic write.
export const rotateSession = async (userId, currentSessionId, nextSessionId, extraUpdate = {}) => {
  if (typeof currentSessionId !== "string" || !currentSessionId) return false;
  const result = await User.updateOne(
    { _id: userId, activeSessionId: currentSessionId },
    { $set: { ...extraUpdate, activeSessionId: nextSessionId } }
  );
  return result.modifiedCount > 0;
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
