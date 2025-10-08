import logger from "#config/logger.js";
import bcrypt from "bcrypt";
import User from "#src/models/user.model.js";

export const hashPassword = async (password) => {
  try {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
  } catch (e) {
    logger.error(`Error hashing password: ${e}`);
    throw new Error("Error hashing password");
  }
};

export const createUser = async ({ fullName, email, password }) => {
  try {
    const userExists = await User.findOne({ email });

    if (userExists) {
      throw new Error("Email already in use");
    }

    const hashedPassword = await hashPassword(password);

    const newUser = new User({
      fullName,
      email,
      password: hashedPassword,
    });

    await newUser.save();
    logger.info(`User ${newUser.email} created successfully`);
    return newUser;
  } catch (e) {
    logger.error(`Error creating user: ${e}`);
    throw e;
  }
};

export const comparePassword = async (password, hashedPassword) => {
  try {
    return await bcrypt.compare(password, hashedPassword);
  } catch (e) {
    logger.error(`Error comparing password: ${e}`);
    throw new Error("Error comparing password");
  }
};

export const authenticateUser = async ({ email, password }) => {
  try {
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    });

    if (!user) {
      throw new Error("Invalid email or password");
    }

    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
      throw new Error("Invalid email or password");
    }

    logger.info(`User ${user.email} authenticated successfully`);

    // Return a sanitized object with explicit id field
    return {
      id: String(user._id),
      email: user.email,
      fullName: user.fullName,
      profilePic: user.profilePic,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  } catch (e) {
    logger.error(`Error authenticating user: ${e}`);
    throw e;
  }
};
