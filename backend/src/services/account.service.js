import crypto from "node:crypto";
import Block from "#models/block.model.js";
import ChatDeletion from "#models/chatDeletion.model.js";
import ChatHide from "#models/chatHide.model.js";
import ChatMute from "#models/chatMute.model.js";
import EmailChange from "#models/emailChange.model.js";
import EmailVerification from "#models/emailVerification.model.js";
import Friendship from "#models/friendship.model.js";
import Message from "#models/message.model.js";
import PasswordReset from "#models/passwordReset.model.js";
import User from "#models/user.model.js";
import logger from "#config/logger.js";
import { comparePassword, hashPassword } from "#services/auth.service.js";
import { sendEmail } from "#services/email.service.js";
import { removeFile } from "#services/message.service.js";
import { privacyOf } from "#services/privacy.service.js";
import { absoluteFileUrl } from "#services/storage.service.js";
import { deleteStoredProfileImage, isDefaultProfileImage } from "#services/user.service.js";
import { createAccountDeletedEmail } from "#utils/emailTemplates.js";

export const ACCOUNT_ERRORS = Object.freeze({
  NOT_FOUND: "ACCOUNT_NOT_FOUND",
  INVALID_PASSWORD: "ACCOUNT_INVALID_PASSWORD",
});

// How a deleted account appears to the people it wrote to.
export const DELETED_ACCOUNT_NAME = "Deleted account";

const hasFile = { $exists: true, $nin: [null, ""] };
const hasNoText = [{ text: { $exists: false } }, { text: null }, { text: "" }];

// Everyone who should see the account go: people it has chatted with and
// people in a friendship or request with it.
const peopleToTell = async (userId, friendships) => {
  const [wroteTo, heardFrom] = await Promise.all([
    Message.distinct("receiverId", { senderId: userId }),
    Message.distinct("senderId", { receiverId: userId }),
  ]);
  const ids = [
    ...wroteTo,
    ...heardFrom,
    ...friendships.flatMap(({ requester, recipient }) => [requester, recipient]),
  ].map(String);
  return [...new Set(ids)].filter((id) => id !== String(userId));
};

// Deletes the account at once, after checking its password. The user
// document stays as an empty shell (see the model) so the messages it sent
// still read as from "Deleted account"; everything that was theirs alone is
// removed. Returns what the caller needs afterwards: the old address and
// name for the goodbye email, the session to sign out, and who to tell.
export const deleteAccount = async (userId, password, now = new Date()) => {
  const user = await User.findById(userId).select("+activeSessionId").lean();
  if (!user || user.deletedAt) throw new Error(ACCOUNT_ERRORS.NOT_FOUND);
  if (!(await comparePassword(password, user.password))) throw new Error(ACCOUNT_ERRORS.INVALID_PASSWORD);

  const friendships = await Friendship.find({ $or: [{ requester: userId }, { recipient: userId }] })
    .select("requester recipient")
    .lean();
  const contacts = await peopleToTell(userId, friendships);
  const sentFiles = await Message.find({ senderId: userId, image: hasFile }).select("image").lean();
  // Nobody knows this password, so the shell can never be signed into.
  const unusablePassword = await hashPassword(crypto.randomBytes(32).toString("base64url"));

  // First, so from here on nobody can sign in, find or message the account,
  // even if the cleanup below stops halfway.
  const emptied = await User.updateOne(
    { _id: userId, deletedAt: null },
    {
      $set: {
        deletedAt: now,
        fullName: DELETED_ACCOUNT_NAME,
        // Unique like any address, and on a domain that can't receive mail
        // (RFC 2606), so the real address is free to sign up again.
        email: `deleted-${userId}@deleted.invalid`,
        profilePic: "",
        password: unusablePassword,
        emailVerifiedAt: null,
      },
      $unset: { activeSessionId: 1, privacy: 1 },
    }
  );
  if (!emptied.modifiedCount) throw new Error(ACCOUNT_ERRORS.NOT_FOUND);

  // Their files go; a message that was only a file reads as deleted.
  await Message.updateMany(
    { senderId: userId, image: hasFile, $or: hasNoText },
    { $set: { deletedAt: now }, $unset: { image: 1, editedAt: 1 } }
  );
  await Message.updateMany({ senderId: userId, image: hasFile }, { $unset: { image: 1 } });

  await Promise.all([
    Friendship.deleteMany({ $or: [{ requester: userId }, { recipient: userId }] }),
    Block.deleteMany({ $or: [{ blocker: userId }, { blocked: userId }] }),
    ChatMute.deleteMany({ userId }),
    ChatHide.deleteMany({ userId }),
    ChatDeletion.deleteMany({ userId }),
    EmailVerification.deleteOne({ userId }),
    PasswordReset.deleteOne({ userId }),
    EmailChange.deleteOne({ userId }),
  ]);

  // Storage last: a failure there leaves an orphaned file at worst.
  await Promise.all([
    deleteStoredProfileImage(userId, user.profilePic),
    ...sentFiles.map(({ image }) => removeFile(image)),
  ]);

  logger.info(`Account ${userId} deleted`, { contacts: contacts.length, files: sentFiles.length });
  return {
    email: user.email,
    fullName: user.fullName,
    activeSessionId: user.activeSessionId,
    contacts,
  };
};

export const sendAccountDeletedEmail = ({ email, fullName }, deletedAt = new Date()) =>
  sendEmail({ to: email, ...createAccountDeletedEmail({ name: fullName, email, deletedAt }) });

const otherOf = (message, userId) =>
  String(message.senderId) === String(userId) ? message.receiverId : message.senderId;

// Everything stored about the account, readable by a person: the right of
// access under GDPR. Files are listed by address, not copied in.
export const buildAccountExport = async (userId, now = new Date()) => {
  const user = await User.findById(userId).lean();
  if (!user || user.deletedAt) throw new Error(ACCOUNT_ERRORS.NOT_FOUND);

  const either = (a, b) => ({ $or: [{ [a]: userId }, { [b]: userId }] });
  const [messages, friendships, blocks, mutes, hides, cleared] = await Promise.all([
    Message.find(either("senderId", "receiverId")).sort({ createdAt: 1, _id: 1 }).lean(),
    Friendship.find(either("requester", "recipient")).lean(),
    Block.find({ blocker: userId }).sort({ createdAt: 1 }).lean(),
    ChatMute.find({ userId }).lean(),
    ChatHide.find({ userId }).lean(),
    ChatDeletion.find({ userId }).lean(),
  ]);

  const peerIds = new Set([
    ...messages.map((message) => String(otherOf(message, userId))),
    ...friendships.flatMap(({ requester, recipient }) => [String(requester), String(recipient)]),
    ...[...blocks, ...mutes, ...hides, ...cleared].map((row) => String(row.blocked ?? row.peerId)),
  ]);
  peerIds.delete(String(userId));
  const peers = await User.find({ _id: { $in: [...peerIds] } }).select("fullName deletedAt").lean();
  const names = new Map(
    peers.map((peer) => [String(peer._id), peer.deletedAt ? DELETED_ACCOUNT_NAME : peer.fullName])
  );
  const person = (id) => ({ id: String(id), fullName: names.get(String(id)) ?? DELETED_ACCOUNT_NAME });
  const isMine = (id) => String(id) === String(userId);

  const pending = friendships.filter((friendship) => friendship.status === "pending");
  return {
    format: "convo-account-export",
    version: 1,
    exportedAt: now.toISOString(),
    account: {
      id: String(user._id),
      fullName: user.fullName,
      email: user.email,
      createdAt: user.createdAt,
      emailConfirmedAt: user.emailVerifiedAt ?? null,
      profilePicture: isDefaultProfileImage(user.profilePic) ? null : absoluteFileUrl(user.profilePic),
      privacy: privacyOf(user),
    },
    friends: friendships
      .filter((friendship) => friendship.status === "accepted")
      .map((friendship) => ({
        user: person(isMine(friendship.requester) ? friendship.recipient : friendship.requester),
        since: friendship.respondedAt ?? friendship.updatedAt,
      })),
    friendRequests: {
      sent: pending
        .filter((request) => isMine(request.requester))
        .map((request) => ({ user: person(request.recipient), sentAt: request.createdAt })),
      received: pending
        .filter((request) => isMine(request.recipient))
        .map((request) => ({ user: person(request.requester), receivedAt: request.createdAt })),
    },
    blocked: blocks.map((block) => ({ user: person(block.blocked), blockedAt: block.createdAt })),
    conversationSettings: {
      muted: mutes.map((mute) => ({ user: person(mute.peerId), until: mute.mutedUntil })),
      hidden: hides.map((hide) => ({ user: person(hide.peerId), hiddenAt: hide.hiddenAt })),
      historyDeletedBefore: cleared.map((row) => ({ user: person(row.peerId), before: row.deletedBefore })),
    },
    messages: messages.map((message) => ({
      id: String(message._id),
      direction: isMine(message.senderId) ? "sent" : "received",
      with: person(otherOf(message, userId)),
      sentAt: message.createdAt,
      text: message.text || undefined,
      attachment: absoluteFileUrl(message.image) || undefined,
      editedAt: message.editedAt ?? undefined,
      readAt: message.readAt ?? undefined,
      deletedForEveryoneAt: message.deletedAt ?? undefined,
      deletedForMe: message.hiddenFor?.some(isMine) || undefined,
    })),
  };
};
