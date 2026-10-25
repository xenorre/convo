import mongoose from "mongoose";

// A requested change of sign-in email, waiting for the link sent to the new
// address. Only a hash of the token is stored. One per user: asking again
// replaces the old request.
const emailChanges = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    newEmail: { type: String, required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

emailChanges.index({ userId: 1 }, { unique: true });
emailChanges.index({ tokenHash: 1 }, { unique: true });
// MongoDB deletes requests once their link expires.
emailChanges.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const EmailChange = mongoose.model("EmailChange", emailChanges);

export default EmailChange;
