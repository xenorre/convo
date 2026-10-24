import mongoose from "mongoose";
import User from "#src/models/user.model.js";
import { messagePermission } from "#src/services/privacy.service.js";

// A "typing" signal goes on only to someone the sender may message, so a
// block or "friends only" also hides typing. The answer is remembered for a
// short while, since clients repeat the signal every few seconds.
export const TYPING_PERMISSION_TTL_MS = 10 * 1000;
// Repeated "typing" signals to the same person closer together than this
// are dropped; the client sends one about every 2.5 s.
export const TYPING_MIN_INTERVAL_MS = 1000;

const isValidPayload = (payload) =>
  payload
  && typeof payload === "object"
  && typeof payload.isTyping === "boolean"
  && typeof payload.to === "string"
  && mongoose.isValidObjectId(payload.to);

// One per socket: what this socket was allowed and last sent, per recipient.
export const createTypingState = () => ({
  permissions: new Map(), // peerId -> { allowed, checkedAt }
  lastStartAt: new Map(), // peerId -> ms
  typingTo: new Set(), // peers told "typing" and not yet "stopped"
});

const mayMessage = async (state, senderId, peerId, now) => {
  const cached = state.permissions.get(peerId);
  if (cached && now - cached.checkedAt < TYPING_PERMISSION_TTL_MS) return cached.allowed;

  const receiver = await User.findById(peerId).select("privacy").lean();
  const allowed = Boolean(receiver) && (await messagePermission(senderId, receiver)).allowed;
  state.permissions.set(peerId, { allowed, checkedAt: now });
  return allowed;
};

// Relays one signal from `senderId`; returns whether it was passed on.
// `emit(room, event, data)` sends to a Socket.IO room.
export const relayTyping = async (state, senderId, payload, emit, now = Date.now()) => {
  if (!isValidPayload(payload)) return false;
  const peerId = payload.to;
  if (peerId === String(senderId)) return false;

  if (payload.isTyping) {
    if (now - (state.lastStartAt.get(peerId) ?? -Infinity) < TYPING_MIN_INTERVAL_MS) return false;
    if (!(await mayMessage(state, senderId, peerId, now))) return false;
    state.lastStartAt.set(peerId, now);
    state.typingTo.add(peerId);
  } else {
    // Only someone who was told "typing" needs to hear that it stopped.
    if (!state.typingTo.delete(peerId)) return false;
    state.lastStartAt.delete(peerId);
  }

  emit(`user:${peerId}`, "typing", { userId: String(senderId), isTyping: payload.isTyping });
  return true;
};

// A socket that goes away mid-sentence stops "typing" for everyone it told.
export const stopAllTyping = (state, senderId, emit) => {
  for (const peerId of state.typingTo) {
    emit(`user:${peerId}`, "typing", { userId: String(senderId), isTyping: false });
  }
  state.typingTo.clear();
};
