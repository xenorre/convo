import mongoose from "mongoose";

// `userId` muted notifications for messages from `peerId`, until `mutedUntil`
// or, when it is null, until they turn them back on.
const chatMutes = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    peerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    mutedUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

chatMutes.index({ userId: 1, peerId: 1 }, { unique: true });
// MongoDB drops timed mutes after they end; a null date never expires.
chatMutes.index({ mutedUntil: 1 }, { expireAfterSeconds: 0 });

const ChatMute = mongoose.model("ChatMute", chatMutes);

export default ChatMute;
