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
    // Set when the sender changed the text; only the latest text is kept.
    editedAt: {
      type: Date,
      default: null,
    },
    // Set when the sender deleted it for everyone; text and file are gone and
    // both people see a "deleted" placeholder instead.
    deletedAt: {
      type: Date,
      default: null,
    },
    // People who deleted it for themselves. Once both have, it is removed.
    hiddenFor: {
      type: [mongoose.Schema.Types.ObjectId],
      default: undefined,
    },
  },
  {
    timestamps: true,
    toJSON: {
      // Whether the other person deleted a message for themselves is theirs to know.
      transform: (_doc, ret) => {
        delete ret.hiddenFor;
        return ret;
      },
    },
  }
);

// The chat list matches on either side of a conversation and reads newest
// first (_id breaks timestamp ties); MongoDB merges these two index scans
// instead of sorting every message in memory.
messages.index({ senderId: 1, createdAt: -1, _id: -1 });
messages.index({ receiverId: 1, createdAt: -1, _id: -1 });

const Message = mongoose.model("Message", messages);

export default Message;
