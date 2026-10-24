import mongoose from "mongoose";

// The pending email confirmation of a new account. Only a hash of the token
// in the emailed link is stored, so a database leak can't confirm accounts.
// One per user: asking for a new link replaces the old one.
const emailVerifications = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

emailVerifications.index({ userId: 1 }, { unique: true });
emailVerifications.index({ tokenHash: 1 }, { unique: true });
// MongoDB deletes links once they expire.
emailVerifications.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const EmailVerification = mongoose.model("EmailVerification", emailVerifications);

export default EmailVerification;
