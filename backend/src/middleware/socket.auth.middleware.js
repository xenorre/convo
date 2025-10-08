import { jwttoken } from "#utils/jwt.js";
import User from "#models/user.model.js";
import logger from "#src/config/logger.js";

const socketAuthMiddleware = async (socket, next) => {
  try {
    const token = socket.handshake.headers.cookie
      ?.split("; ")
      .find((row) => row.startsWith("token="))
      ?.split("=")[1];

    if (!token) {
      logger.error("Socket connection unauthorized: No token provided");
      return next(new Error("Unauthorized"));
    }

    const decoded = jwttoken.verify(token);

    if (!decoded) {
      logger.error("Socket connection rejected: Invalid token");
      return next(new Error("Unauthorized"));
    }

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      logger.error("Socket connection rejected: User not found");
      return next(new Error("Unauthorized"));
    }

    socket.user = user;
    socket.userId = user._id.toString();

    logger.info("Socket connection authorized for user:", user.email);
    next();
  } catch (error) {
    next(new Error("Unauthorized - failed"));
  }
};

export default socketAuthMiddleware;
