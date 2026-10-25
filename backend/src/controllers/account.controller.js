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
import { deleteAccountSchema } from "#validations/user.validation.js";

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
