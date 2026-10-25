import logger from "#config/logger.js";
import { io } from "#config/socket.js";
import {
  ACCOUNT_ERRORS,
  buildAccountExport,
  deleteAccount,
  sendAccountDeletedEmail,
} from "#services/account.service.js";
import { ACCOUNT_DELETED } from "#services/session.service.js";
import { userRoom } from "#services/socket-session.service.js";
import { cookies } from "#utils/cookies.js";
import { formatValidationError } from "#utils/format.js";
import {
  cancelEmailChange,
  EMAIL_CHANGE_ERRORS,
  getPendingEmailChange,
  requestEmailChange,
  sendEmailChangeRequestedEmail,
} from "#services/emailChange.service.js";
import { changeEmailSchema, deleteAccountSchema } from "#validations/user.validation.js";

// Deletes the signed-in account once its password is confirmed. Every tab
// and device of the account is signed out, and the people it talked to
// see it turn into "Deleted account" without reloading.
export const deleteMyAccount = async (req, res) => {
  const parsed = deleteAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: formatValidationError(parsed.error), requestId: req.requestId });
  }

  const userId = String(req.user._id);
  try {
    const deleted = await deleteAccount(userId, parsed.data.password);

    io.to(userRoom(userId)).emit("session:revoked", ACCOUNT_DELETED);
    io.in(userRoom(userId)).disconnectSockets(true);
    for (const contactId of deleted.contacts) {
      io.to(userRoom(contactId)).emit("account:deleted", { userId });
    }

    cookies.clear(res, "token");
    res.status(200).json({ message: "Account deleted", requestId: req.requestId });

    sendAccountDeletedEmail(deleted).catch((error) =>
      logger.error("Error sending account deleted email", { requestId: req.requestId, error: error.message })
    );
  } catch (error) {
    // 400, not 401: the client treats every 401 as a signed-out session.
    if (error.message === ACCOUNT_ERRORS.INVALID_PASSWORD) {
      return res.status(400).json({
        error: "Password is incorrect",
        code: ACCOUNT_ERRORS.INVALID_PASSWORD,
        requestId: req.requestId,
      });
    }
    if (error.message === ACCOUNT_ERRORS.NOT_FOUND) {
      return res.status(401).json({ error: ACCOUNT_DELETED.message, code: ACCOUNT_DELETED.code, requestId: req.requestId });
    }
    logger.error("Error deleting account", { requestId: req.requestId, userId, error: error.message });
    res.status(500).json({ error: "Internal server error", requestId: req.requestId });
  }
};

export const exportMyData = async (req, res) => {
  try {
    const data = await buildAccountExport(req.user._id);
    // A personal copy: never kept by a proxy or the browser cache.
    res.set("Cache-Control", "no-store");
    res.status(200).json(data);
  } catch (error) {
    if (error.message === ACCOUNT_ERRORS.NOT_FOUND) {
      return res.status(401).json({ error: ACCOUNT_DELETED.message, code: ACCOUNT_DELETED.code, requestId: req.requestId });
    }
    logger.error("Error exporting account data", { requestId: req.requestId, error: error.message });
    res.status(500).json({ error: "Internal server error", requestId: req.requestId });
  }
};

const EMAIL_CHANGE_REFUSALS = {
  // 400, not 401: the client treats every 401 as a signed-out session.
  [EMAIL_CHANGE_ERRORS.INVALID_PASSWORD]: [400, "Password is incorrect", "password"],
  [EMAIL_CHANGE_ERRORS.SAME_EMAIL]: [400, "That's already your email", "newEmail"],
  [EMAIL_CHANGE_ERRORS.EMAIL_TAKEN]: [409, "Another account already uses this email", "newEmail"],
  [EMAIL_CHANGE_ERRORS.TOO_SOON]: [429, "We just sent a link there. Wait a minute before asking again", "newEmail"],
};

// The sign-in email, and a change still waiting for its link.
export const getEmail = async (req, res) => {
  try {
    const pending = await getPendingEmailChange(req.user._id);
    res.status(200).json({
      email: req.user.email,
      pending: pending ? { email: pending.newEmail, expiresAt: pending.expiresAt } : null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error("Error reading email settings", { requestId: req.requestId, error: error.message });
    res.status(500).json({ error: "Internal server error", requestId: req.requestId });
  }
};

// Sends the link to the new address and tells the current one.
export const changeEmail = async (req, res) => {
  const parsed = changeEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0] === "password" ? "password" : "newEmail";
    return res.status(400).json({ error: formatValidationError(parsed.error), field, requestId: req.requestId });
  }

  try {
    const request = await requestEmailChange(req.user._id, parsed.data.newEmail, parsed.data.password);
    res.status(200).json({
      pending: { email: request.newEmail, expiresAt: request.expiresAt },
      requestId: req.requestId,
    });
    sendEmailChangeRequestedEmail(request).catch((error) =>
      logger.error("Error sending email change notice", { requestId: req.requestId, error: error.message })
    );
  } catch (error) {
    const refusal = EMAIL_CHANGE_REFUSALS[error.message];
    if (refusal) {
      const [status, message, field] = refusal;
      return res.status(status).json({ error: message, code: error.message, field, requestId: req.requestId });
    }
    if (error.message === EMAIL_CHANGE_ERRORS.NOT_FOUND) {
      return res.status(401).json({ error: ACCOUNT_DELETED.message, code: ACCOUNT_DELETED.code, requestId: req.requestId });
    }
    logger.error("Error requesting email change", { requestId: req.requestId, error: error.message });
    res.status(500).json({ error: "Couldn't send the confirmation email. Try again later.", requestId: req.requestId });
  }
};

export const cancelPendingEmailChange = async (req, res) => {
  try {
    await cancelEmailChange(req.user._id);
    res.status(200).json({ pending: null, requestId: req.requestId });
  } catch (error) {
    logger.error("Error cancelling email change", { requestId: req.requestId, error: error.message });
    res.status(500).json({ error: "Internal server error", requestId: req.requestId });
  }
};
