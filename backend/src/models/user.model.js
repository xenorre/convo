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
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", users);

export default User;
