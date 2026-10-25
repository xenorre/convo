import User from "#src/models/user.model.js";
import { cookies } from "#src/utils/cookies.js";
import { jwttoken } from "#src/utils/jwt.js";
import logger from "#config/logger.js";
import {
  ACCOUNT_DELETED,
  hasActiveSession,
  publicSessionUser,
  SESSION_REVOKED,
} from "#services/session.service.js";

export const protectRoute = async (req, res, next) => {
  try {
    const token = cookies.get(req, "token");

    if (!token) {
      return res.status(401).json({
        error: "Unauthorized - No token provided",
      });
    }

    let decoded;
    try {
      decoded = jwttoken.verify(token);
    } catch (e) {
      return res
        .status(401)
        .json({ error: "Unauthorized - Invalid or expired token" });
    }

    if (!decoded?.id) {
      return res
        .status(401)
        .json({ error: "Unauthorized - Invalid token payload" });
    }

    const user = await User.findById(decoded.id).select("-password +activeSessionId");
    // 401, not 404: the browser is simply signed out, like any ended session.
    if (!user || user.deletedAt) {
      return res.status(401).json({ error: ACCOUNT_DELETED.message, code: ACCOUNT_DELETED.code });
    }

    if (!hasActiveSession(user, decoded.sid)) {
      return res.status(401).json({
        error: SESSION_REVOKED.message,
        code: SESSION_REVOKED.code,
      });
    }

    req.user = publicSessionUser(user);
    req.sessionId = decoded.sid;
    next();
  } catch (error) {
    logger.error("Auth middleware error", { error: error.message });
    res.status(500).json({ error: "Internal server error" });
  }
};
