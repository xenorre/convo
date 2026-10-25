import crypto from "node:crypto";

// Tokens for emailed links. Only the hash is stored, so a database leak
// can't be used to follow the links.
export const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

// 256 random bits; `token` goes into the email once and is never stored.
export const createOneTimeToken = () => {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
};
