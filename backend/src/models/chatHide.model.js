import mongoose from "mongoose";

// `userId` hid their chat with `peerId` at `hiddenAt`. It stays out of their
// list until a message newer than that arrives.
const chatHides = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    peerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    hiddenAt: { type: Date, required: true },
  },
  { timestamps: true }
);

chatHides.index({ userId: 1, peerId: 1 }, { unique: true });

const ChatHide = mongoose.model("ChatHide", chatHides);

export default ChatHide;
