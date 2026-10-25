import EmailChange from "#models/emailChange.model.js";
import User from "#models/user.model.js";
import { ENV } from "#config/env.js";
import logger from "#config/logger.js";
import { comparePassword } from "#services/auth.service.js";
import { sendEmail } from "#services/email.service.js";
import {
  createEmailChangeConfirmEmail,
  createEmailChangedEmail,
  createEmailChangeRequestedEmail,
} from "#utils/emailTemplates.js";
import { createOneTimeToken, hashToken } from "#utils/oneTimeToken.js";

// Like the link that activates a new account: the password was already
// checked, the link only proves the new address is theirs.
export const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60 * 1000;
export const EMAIL_CHANGE_COOLDOWN_MS = 60 * 1000;

export const EMAIL_CHANGE_ERRORS = Object.freeze({
  NOT_FOUND: "EMAIL_CHANGE_ACCOUNT_NOT_FOUND",
  INVALID_PASSWORD: "EMAIL_CHANGE_INVALID_PASSWORD",
  SAME_EMAIL: "EMAIL_CHANGE_SAME_EMAIL",
  EMAIL_TAKEN: "EMAIL_CHANGE_EMAIL_TAKEN",
  TOO_SOON: "EMAIL_CHANGE_TOO_SOON",
});

// Where the link in the email leads; the page there sends the token back.
export const emailChangeLink = (token) =>
  `${ENV.CLIENT_URL ?? "http://localhost:5173"}/confirm-email-change?token=${encodeURIComponent(token)}`;

// Checks the password, then emails a link to `newEmail`, replacing any
// earlier request. The current address is told separately by the caller.
// Sign-up already says when an email is taken, so saying it here reveals
// nothing new; the route is rate limited all the same.
export const requestEmailChange = async (userId, newEmail, password, now = new Date()) => {
  const user = await User.findById(userId).lean();
  if (!user || user.deletedAt) throw new Error(EMAIL_CHANGE_ERRORS.NOT_FOUND);
  if (!(await comparePassword(password, user.password))) throw new Error(EMAIL_CHANGE_ERRORS.INVALID_PASSWORD);
  if (newEmail === user.email) throw new Error(EMAIL_CHANGE_ERRORS.SAME_EMAIL);
  if (await User.exists({ email: newEmail })) throw new Error(EMAIL_CHANGE_ERRORS.EMAIL_TAKEN);

  const pending = await EmailChange.findOne({ userId }).select("newEmail updatedAt").lean();
  if (pending?.newEmail === newEmail && now - pending.updatedAt < EMAIL_CHANGE_COOLDOWN_MS) {
    throw new Error(EMAIL_CHANGE_ERRORS.TOO_SOON);
  }

  const { token, tokenHash } = createOneTimeToken();
  const expiresAt = new Date(now.getTime() + EMAIL_CHANGE_TTL_MS);
  await EmailChange.findOneAndUpdate(
    { userId },
    { $set: { newEmail, tokenHash, expiresAt } },
    { upsert: true }
  );
  try {
    await sendEmail({
      to: newEmail,
      ...createEmailChangeConfirmEmail({
        name: user.fullName,
        newEmail,
        link: emailChangeLink(token),
        expiresInHours: EMAIL_CHANGE_TTL_MS / (60 * 60 * 1000),
      }),
    });
  } catch (error) {
    // A link that never arrived must not hold up the next try.
    await EmailChange.deleteOne({ userId });
    throw error;
  }
  return { email: user.email, fullName: user.fullName, newEmail, expiresAt };
};

// The change still waiting for its link, or null.
export const getPendingEmailChange = (userId, now = new Date()) =>
  EmailChange.findOne({ userId, expiresAt: { $gt: now } }).select("newEmail expiresAt").lean();

export const cancelEmailChange = (userId) => EmailChange.deleteOne({ userId });

// Uses the link up and moves the account to the new address, which counts
// as confirmed. Returns the old and new address, or null when the link is
// unknown, used or expired. Someone may have signed up with the address in
// the meantime; the unique index refuses it then.
export const confirmEmailChange = async (token, now = new Date()) => {
  const pending = await EmailChange.findOneAndDelete({
    tokenHash: hashToken(token),
    expiresAt: { $gt: now },
  }).lean();
  if (!pending) return null;

  let previous;
  try {
    previous = await User.findOneAndUpdate(
      { _id: pending.userId, deletedAt: null },
      { $set: { email: pending.newEmail, emailVerifiedAt: now } },
      { new: false }
    )
      .select("email fullName")
      .lean();
  } catch (error) {
    if (error?.code === 11000) throw new Error(EMAIL_CHANGE_ERRORS.EMAIL_TAKEN);
    throw error;
  }
  if (!previous) return null;

  logger.info(`Email changed for user ${pending.userId}`);
  return {
    userId: String(pending.userId),
    previousEmail: previous.email,
    email: pending.newEmail,
    fullName: previous.fullName,
  };
};

export const sendEmailChangeRequestedEmail = ({ email, fullName, newEmail }) =>
  sendEmail({ to: email, ...createEmailChangeRequestedEmail({ name: fullName, email, newEmail }) });

export const sendEmailChangedEmail = ({ previousEmail, fullName, email }, changedAt = new Date()) =>
  sendEmail({
    to: previousEmail,
    ...createEmailChangedEmail({ name: fullName, email: previousEmail, newEmail: email, changedAt }),
  });
