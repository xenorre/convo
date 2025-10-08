import User from "#src/models/user.model.js";
import { cookies } from "#src/utils/cookies.js";
import { jwttoken } from "#src/utils/jwt.js";
import logger from "#config/logger.js";

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

    const user = await User.findById(decoded.id).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });

    req.user = user;
    req.user.id = String(user._id);
    next();
  } catch (error) {
    logger.error("Auth middleware error", { error: error.message });
    res.status(500).json({ error: "Internal server error" });
  }
};
