import {
  changePasswordSchema,
  signInSchema,
  signUpSchema,
} from "#validations/auth.validation.js";
import { formatValidationError } from "#utils/format.js";
import {
  authenticateUser,
  changeUserPassword,
  createUser,
  PASSWORD_ERRORS,
} from "#services/auth.service.js";
import { jwttoken } from "#utils/jwt.js";
import { cookies } from "#utils/cookies.js";
import { sendWelcomeEmail } from "#src/services/email.service.js";
import { ENV } from "#config/env.js";
import logger from "#config/logger.js";
import {
  activateSession,
  createSessionId,
  endSession,
  SESSION_REVOKED,
} from "#services/session.service.js";
import {
  closeSessionSockets,
  revokeSessionSockets,
} from "#services/socket-session.service.js";
import { io } from "#config/socket.js";

const startUserSession = async (user, res) => {
  const sessionId = createSessionId();
  const token = jwttoken.sign({ id: user.id, sid: sessionId });
  const previousSessionId = await activateSession(user.id, sessionId);
  revokeSessionSockets(io, user.id, previousSessionId);
  cookies.set(res, "token", token);
};

export const signUp = async (req, res, next) => {
  try {
    const validationResult = signUpSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: formatValidationError(validationResult.error),
        requestId: req.requestId,
      });
    }

    const { fullName, email, password } = validationResult.data;

    const user = await createUser({ fullName, email, password });

    if (user) {
      await startUserSession(user, res);
    } else {
      return res
        .status(400)
        .json({ error: "Unable to create user", requestId: req.requestId });
    }

    // Respond first
    res.status(201).json({
      message: "User registered successfully",
      user: {
        email: user.email,
        profilePic: user.profilePic,
        fullName: user.fullName,
      },
      requestId: req.requestId,
    });

    // Fire-and-forget email; never affects the response
    sendWelcomeEmail(user.email, user.fullName, ENV.CLIENT_URL).catch((err) =>
      logger.error("Error sending welcome email", {
        requestId: req.requestId,
        email: user.email,
        error: err.message,
      })
    );
  } catch (e) {
    if (e.message === "Email already in use") {
      return res
        .status(409)
        .json({ error: "Email already in use", requestId: req.requestId });
    }

    logger.error("Error in signUp", {
      requestId: req.requestId,
      error: e.message,
    });
    res
      .status(500)
      .json({ error: "Internal server error", requestId: req.requestId });
  }
};

export const login = async (req, res) => {
  try {
    const validationResult = signInSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: formatValidationError(validationResult.error),
        requestId: req.requestId,
      });
    }

    const { email, password } = validationResult.data;
    const user = await authenticateUser({ email, password });

    await startUserSession(user, res);

    res.status(200).json({
      message: "User logged in successfully",
      user: {
        email: user.email,
        profilePic: user.profilePic,
        fullName: user.fullName,
        _id: user.id,
      },
      requestId: req.requestId,
    });
  } catch (e) {
    if (e.message === "Invalid email or password") {
      return res
        .status(401)
        .json({ error: "Invalid email or password", requestId: req.requestId });
    }

    res
      .status(500)
      .json({ error: "Internal server error", requestId: req.requestId });
  }
};

export const changePassword = async (req, res) => {
  try {
    const validationResult = changePasswordSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: formatValidationError(validationResult.error),
        requestId: req.requestId,
      });
    }

    const userId = req.user.id;
    const nextSessionId = createSessionId();
    await changeUserPassword({
      userId,
      sessionId: req.sessionId,
      nextSessionId,
      ...validationResult.data,
    });

    // This browser keeps going on the new session; sockets of the old one
    // close quietly and the client reconnects with the new cookie.
    closeSessionSockets(io, userId, req.sessionId);
    cookies.set(res, "token", jwttoken.sign({ id: userId, sid: nextSessionId }));

    res.status(200).json({
      message: "Password changed successfully",
      requestId: req.requestId,
    });
  } catch (e) {
    // 400, not 401: the client treats every 401 as a signed-out session.
    if (e.message === PASSWORD_ERRORS.INVALID_CURRENT) {
      return res.status(400).json({
        error: "Current password is incorrect",
        code: PASSWORD_ERRORS.INVALID_CURRENT,
        requestId: req.requestId,
      });
    }
    if (e.message === PASSWORD_ERRORS.SESSION_ENDED) {
      return res.status(401).json({
        error: SESSION_REVOKED.message,
        code: SESSION_REVOKED.code,
        requestId: req.requestId,
      });
    }

    logger.error("Error changing password", {
      requestId: req.requestId,
      error: e.message,
    });
    res
      .status(500)
      .json({ error: "Internal server error", requestId: req.requestId });
  }
};

export const logout = async (req, res) => {
  try {
    const token = cookies.get(req, "token");
    let userId = "unknown";
    let clearCookie = true;

    if (token) {
      let decoded;
      try {
        decoded = jwttoken.verify(token);
      } catch (tokenError) {
        logger.warn("Invalid token during sign-out", {
          requestId: req.requestId,
          error: tokenError.message,
        });
      }
      if (decoded?.id) {
        userId = decoded.id;
        const ended = await endSession(decoded.id, decoded.sid);
        // A late logout response from a replaced session must not remove a
        // newer cookie that has since been set in this browser.
        clearCookie = ended;
        if (ended) {
          revokeSessionSockets(io, decoded.id, decoded.sid, {
            code: "SESSION_REVOKED",
            message: "Your session has ended. Please sign in again.",
          });
        }
      }
    }

    if (clearCookie) cookies.clear(res, "token");

    logger.info("User signed out successfully", {
      requestId: req.requestId,
      userId,
    });
    res.status(200).json({
      message: "User signed out successfully",
      requestId: req.requestId,
    });
  } catch (e) {
    logger.error("Sign-out error", {
      requestId: req.requestId,
      error: e.message,
    });
    res
      .status(500)
      .json({ error: "Internal server error", requestId: req.requestId });
  }
};
