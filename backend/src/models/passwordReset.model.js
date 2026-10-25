import mongoose from "mongoose";

// A pending password reset. Only a hash of the token in the emailed link is
// stored, so a database leak can't reset passwords. One per user: asking
// again replaces the old link.
const passwordResets = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

passwordResets.index({ userId: 1 }, { unique: true });
passwordResets.index({ tokenHash: 1 }, { unique: true });
// MongoDB deletes links once they expire.
passwordResets.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PasswordReset = mongoose.model("PasswordReset", passwordResets);

export default PasswordReset;
