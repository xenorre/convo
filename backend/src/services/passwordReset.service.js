import PasswordReset from "#models/passwordReset.model.js";
import EmailVerification from "#models/emailVerification.model.js";
import User from "#models/user.model.js";
import { ENV } from "#config/env.js";
import logger from "#config/logger.js";
import { hashPassword } from "#services/auth.service.js";
import { sendEmail } from "#services/email.service.js";
import { createPasswordChangedEmail, createPasswordResetEmail } from "#utils/emailTemplates.js";
import { createOneTimeToken, hashToken } from "#utils/oneTimeToken.js";

// Short, because the link alone gives full access to the account.
export const RESET_TTL_MS = 60 * 60 * 1000;
export const RESET_COOLDOWN_MS = 60 * 1000;

// Where the link in the email leads; the page there sends the token back.
export const resetLink = (token) =>
  `${ENV.CLIENT_URL ?? "http://localhost:5173"}/reset-password?token=${encodeURIComponent(token)}`;

const sendResetEmail = async ({ email, fullName }, token) => {
  const link = resetLink(token);
  await sendEmail({
    to: email,
    ...createPasswordResetEmail({ name: fullName, email, link, expiresInMinutes: RESET_TTL_MS / 60000 }),
  });
};

// Emails a reset link when the account exists and no link went out in the
// last minute. Says nothing either way, so the answer can't reveal which
// emails have accounts. A link that never reached the user is removed again.
export const requestPasswordReset = async (email, now = new Date()) => {
  const user = await User.findOne({ email }).select("email fullName").lean();
  if (!user) return false;

  const pending = await PasswordReset.findOne({ userId: user._id }).select("updatedAt").lean();
  if (pending && now - pending.updatedAt < RESET_COOLDOWN_MS) return false;

  const { token, tokenHash } = createOneTimeToken();
  await PasswordReset.findOneAndUpdate(
    { userId: user._id },
    { $set: { tokenHash, expiresAt: new Date(now.getTime() + RESET_TTL_MS) } },
    { upsert: true }
  );
  try {
    await sendResetEmail(user, token);
  } catch (error) {
    await PasswordReset.deleteOne({ userId: user._id });
    throw error;
  }
  return true;
};

// The account a link resets, without using the link up: the page shows whose
// password it is and checks the new one against the name and email.
// null when the link is unknown, used or expired.
export const findResetAccount = async (token, now = new Date()) => {
  const pending = await PasswordReset.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: now } })
    .select("userId")
    .lean();
  if (!pending) return null;
  return User.findById(pending.userId).select("email fullName").lean();
};

// Uses the link up and sets the new password. The account moves to
// `nextSessionId` in the same write, which signs out every other session,
// and an unconfirmed email counts as confirmed: the link came to it.
// Returns the account as it was before (with its old session), or null when
// the link is no longer valid.
export const completePasswordReset = async (token, newPassword, nextSessionId, now = new Date()) => {
  // Hashed first, so nothing slow sits between using the link up and saving.
  const password = await hashPassword(newPassword);
  const pending = await PasswordReset.findOneAndDelete({
    tokenHash: hashToken(token),
    expiresAt: { $gt: now },
  }).lean();
  if (!pending) return null;

  let previous;
  try {
    previous = await User.findByIdAndUpdate(
      pending.userId,
      // An update pipeline reads any string starting with "$" as a field
      // path, and every bcrypt hash does ("$2b$10$..."), so values go in as
      // literals.
      [{
        $set: {
          password: { $literal: password },
          activeSessionId: { $literal: nextSessionId },
          emailVerifiedAt: { $ifNull: ["$emailVerifiedAt", now] },
        },
      }],
      // Mongoose refuses update pipelines unless asked for one.
      { returnDocument: "before", updatePipeline: true }
    )
      .select("email fullName profilePic +activeSessionId")
      .lean();
  } catch (error) {
    // The password didn't change, so the link must keep working. A newer
    // link may have replaced it in the meantime; that one wins.
    await PasswordReset.create({
      userId: pending.userId,
      tokenHash: pending.tokenHash,
      expiresAt: pending.expiresAt,
    }).catch(() => {});
    throw error;
  }
  if (!previous) return null;

  await EmailVerification.deleteOne({ userId: pending.userId });
  logger.info(`Password reset for user ${pending.userId}`);
  return previous;
};

// Once the password changes any other way, an older reset link must not
// change it again.
export const cancelPasswordReset = (userId) => PasswordReset.deleteOne({ userId });

export const sendPasswordChangedEmail = ({ email, fullName }, changedAt = new Date()) =>
  sendEmail({ to: email, ...createPasswordChangedEmail({ name: fullName, email, changedAt }) });
