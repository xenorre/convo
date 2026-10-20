import mongoose from "mongoose";

const messages = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    text: {
      type: String,
      trim: true,
      maxLength: 2000,
    },
    image: {
      type: String, // This field will store file URLs (images, documents, etc.)
    },
    readAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

// The chat list matches on either side of a conversation and reads newest
// first (_id breaks timestamp ties); MongoDB merges these two index scans
// instead of sorting every message in memory.
messages.index({ senderId: 1, createdAt: -1, _id: -1 });
messages.index({ receiverId: 1, createdAt: -1, _id: -1 });

const Message = mongoose.model("Message", messages);

export default Message;
