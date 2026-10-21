import mongoose from "mongoose";

// `blocker` no longer wants contact with `blocked`. Checks look both ways,
// so either side's block stops messages and friend requests between them.
const blocks = new mongoose.Schema(
  {
    blocker: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    blocked: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

blocks.index({ blocker: 1, blocked: 1 }, { unique: true });
blocks.index({ blocked: 1 });

const Block = mongoose.model("Block", blocks);

export default Block;
