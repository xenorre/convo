import mongoose from "mongoose";

// `userId` deleted their chat with `peerId`: messages between the two created
// up to `deletedBefore` are gone for `userId` only. Once both sides have
// deleted, the messages they both deleted are removed from the database.
const chatDeletions = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    peerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    deletedBefore: { type: Date, required: true },
  },
  { timestamps: true }
);

chatDeletions.index({ userId: 1, peerId: 1 }, { unique: true });

const ChatDeletion = mongoose.model("ChatDeletion", chatDeletions);

export default ChatDeletion;
