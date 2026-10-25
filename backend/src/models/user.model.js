import mongoose from "mongoose";

const users = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    fullName: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
      minLength: 6,
    },
    activeSessionId: {
      type: String,
      select: false,
    },
    // Set when the owner opened the confirmation link; null means the
    // account can't sign in yet. Accounts from before email confirmation
    // were marked confirmed by a migration.
    emailVerifiedAt: {
      type: Date,
      default: null,
    },
    // Set when the owner deleted the account. What's left is an empty shell
    // (no name, email, photo, password or settings) that keeps their old
    // messages readable for the people they wrote to, as "Deleted account".
    deletedAt: {
      type: Date,
      default: null,
    },
    profilePic: {
      type: String,
      default:
        "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png",
    },
    // Read through privacyOf() in privacy.service.js: accounts created before
    // these settings existed (and .lean() reads) have no values stored.
    privacy: {
      allowMessagesFrom: { type: String, enum: ["everyone", "friends"], default: "friends" },
      allowFriendRequestsFrom: { type: String, enum: ["everyone", "nobody"], default: "everyone" },
      showOnlineStatus: { type: Boolean, default: true },
      // Mutual: off means neither sending nor seeing read receipts.
      readReceipts: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", users);

export default User;
