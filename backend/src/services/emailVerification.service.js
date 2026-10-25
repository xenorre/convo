import EmailVerification from "#models/emailVerification.model.js";
import User from "#models/user.model.js";
import { ENV } from "#config/env.js";
import logger from "#config/logger.js";
import { sendEmail } from "#services/email.service.js";
import { createVerificationEmail } from "#utils/emailTemplates.js";
import { createOneTimeToken, hashToken } from "#utils/oneTimeToken.js";

// How long an emailed link works, and how soon another may be sent.
export const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;

// Where the link in the email leads; the page there sends the token back.
export const verificationLink = (token) =>
  `${ENV.CLIENT_URL ?? "http://localhost:5173"}/verify-email?token=${encodeURIComponent(token)}`;

// A fresh link for this user, replacing any earlier one. The token itself
// is returned once for the email and never stored.
export const createVerificationToken = async (userId, now = new Date()) => {
  const { token, tokenHash } = createOneTimeToken();
  await EmailVerification.findOneAndUpdate(
    { userId },
    { $set: { tokenHash, expiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS) } },
    { upsert: true }
  );
  return token;
};

export const sendVerificationEmail = async ({ email, fullName }, token) => {
  const link = verificationLink(token);

  await sendEmail({
    to: email,
    ...createVerificationEmail({
      name: fullName,
      email,
      link,
      expiresInHours: VERIFICATION_TTL_MS / (60 * 60 * 1000),
    }),
  });
};

// Creates a link and emails it. A link that never reached the user is
// removed again, so it can't hold up the next try with the resend cooldown.
export const issueVerification = async (user, now = new Date()) => {
  const token = await createVerificationToken(user._id, now);
  try {
    await sendVerificationEmail(user, token);
  } catch (error) {
    await EmailVerification.deleteOne({ userId: user._id });
    throw error;
  }
};

// Uses up a link. Returns the confirmed user, or null when the link is
// unknown, already used or expired.
export const confirmEmail = async (token, now = new Date()) => {
  const pending = await EmailVerification.findOneAndDelete({
    tokenHash: hashToken(token),
    expiresAt: { $gt: now },
  }).lean();
  if (!pending) return null;

  return User.findByIdAndUpdate(
    pending.userId,
    { $set: { emailVerifiedAt: now } },
    { new: true }
  );
};

// Sends a new link when the account exists, isn't confirmed yet and no link
// went out in the last minute. Says nothing either way, so the answer can't
// reveal which emails have accounts.
export const resendVerification = async (email, now = new Date()) => {
  const user = await User.findOne({ email }).select("email fullName emailVerifiedAt").lean();
  if (!user || user.emailVerifiedAt !== null) return false;

  const pending = await EmailVerification.findOne({ userId: user._id }).select("updatedAt").lean();
  if (pending && now - pending.updatedAt < RESEND_COOLDOWN_MS) return false;

  await issueVerification(user, now);
  return true;
};

// Migration: accounts created before email confirmation keep signing in.
export const markExistingAccountsVerified = async () => {
  const result = await User.updateMany(
    { emailVerifiedAt: { $exists: false } },
    [{ $set: { emailVerifiedAt: { $ifNull: ["$createdAt", "$$NOW"] } } }]
  );
  logger.info("Marked existing accounts as email-confirmed", { updated: result.modifiedCount });
};
