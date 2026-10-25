import { jwttoken } from "#utils/jwt.js";
import User from "#models/user.model.js";
import logger from "#src/config/logger.js";
import {
  hasActiveSession,
  publicSessionUser,
  SESSION_REVOKED,
} from "#services/session.service.js";

const unauthorizedError = () => {
  const error = new Error("Unauthorized");
  error.data = {
    code: "UNAUTHORIZED",
    message: "Your session has expired. Please sign in again.",
  };
  return error;
};

const socketAuthMiddleware = async (socket, next) => {
  try {
    const token = socket.handshake.headers.cookie
      ?.split(";")
      .map((row) => row.trim())
      .find((row) => row.startsWith("token="))
      ?.slice("token=".length);

    if (!token) {
      logger.error("Socket connection unauthorized: No token provided");
      return next(unauthorizedError());
    }

    let decoded;
    try {
      decoded = jwttoken.verify(decodeURIComponent(token));
    } catch {
      return next(unauthorizedError());
    }

    if (!decoded?.id) {
      logger.error("Socket connection rejected: Invalid token");
      return next(unauthorizedError());
    }

    const user = await User.findById(decoded.id).select("-password +activeSessionId");

    if (!user || user.deletedAt) {
      logger.error("Socket connection rejected: User not found");
      return next(unauthorizedError());
    }

    if (!hasActiveSession(user, decoded.sid)) {
      const error = new Error(SESSION_REVOKED.message);
      error.data = SESSION_REVOKED;
      return next(error);
    }

    socket.user = publicSessionUser(user);
    socket.userId = user._id.toString();
    socket.sessionId = decoded.sid;

    logger.info("Socket connection authorized for user:", user.email);
    next();
  } catch (error) {
    logger.error("Socket authorization failed", { error: error.message });
    next(new Error("Unable to authorize connection"));
  }
};

export default socketAuthMiddleware;
