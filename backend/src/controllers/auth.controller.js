import { signInSchema, signUpSchema } from "#validations/auth.validation.js";
import { formatValidationError } from "#utils/format.js";
import { authenticateUser, createUser } from "#services/auth.service.js";
import { jwttoken } from "#utils/jwt.js";
import { cookies } from "#utils/cookies.js";
import { sendWelcomeEmail } from "#src/services/email.service.js";
import { ENV } from "#config/env.js";
import logger from "#config/logger.js";

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
      const token = jwttoken.sign({ id: user.id });
      cookies.set(res, "token", token);
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

    const token = jwttoken.sign({ id: user.id });
    cookies.set(res, "token", token);

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

export const logout = async (req, res) => {
  try {
    const token = cookies.get(req, "token");
    let userId = "unknown";

    if (token) {
      try {
        const decoded = jwttoken.verify(token);
        userId = decoded.id;
      } catch (tokenError) {
        logger.warn("Invalid token during sign-out", {
          requestId: req.requestId,
          error: tokenError.message,
        });
      }
    }

    cookies.clear(res, "token");

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
