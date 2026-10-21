import mongoose from "mongoose";

// One document per pair of users. `pairKey` (both IDs, sorted) keeps it to a
// single relationship whichever side sent the request.
const friendships = new mongoose.Schema(
  {
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    pairKey: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted"],
      default: "pending",
    },
    respondedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

friendships.index({ requester: 1, status: 1 });
friendships.index({ recipient: 1, status: 1 });

export const friendPairKey = (a, b) => [String(a), String(b)].sort().join(":");

const Friendship = mongoose.model("Friendship", friendships);

export default Friendship;
