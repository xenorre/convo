import crypto from "node:crypto";
import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as zxcvbnCommon from "@zxcvbn-ts/language-common";
import * as zxcvbnEn from "@zxcvbn-ts/language-en";
import logger from "#config/logger.js";

// NIST SP 800-63B style: length over composition rules, and no common,
// personal or breached passwords. The frontend shows the same rules live.
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
// zxcvbn scores 0-4; 3 ("good") resists offline guessing for a long time.
export const PASSWORD_MIN_SCORE = 3;

export const PASSWORD_POLICY_ERRORS = Object.freeze({
  TOO_SHORT: "PASSWORD_TOO_SHORT",
  TOO_LONG: "PASSWORD_TOO_LONG",
  PERSONAL: "PASSWORD_PERSONAL",
  TOO_WEAK: "PASSWORD_TOO_WEAK",
  BREACHED: "PASSWORD_BREACHED",
});

export const PASSWORD_POLICY_MESSAGES = Object.freeze({
  [PASSWORD_POLICY_ERRORS.TOO_SHORT]: `Use at least ${PASSWORD_MIN_LENGTH} characters`,
  [PASSWORD_POLICY_ERRORS.TOO_LONG]: `Use at most ${PASSWORD_MAX_LENGTH} characters`,
  [PASSWORD_POLICY_ERRORS.PERSONAL]: "Don't use your name or email in your password",
  [PASSWORD_POLICY_ERRORS.TOO_WEAK]: "This password is too easy to guess. Try a longer phrase of unrelated words",
  [PASSWORD_POLICY_ERRORS.BREACHED]:
    "This password has appeared in a data breach, so attackers try it first. Choose a different one",
});

const zxcvbn = new ZxcvbnFactory({
  dictionary: { ...zxcvbnCommon.dictionary, ...zxcvbnEn.dictionary },
  graphs: zxcvbnCommon.adjacencyGraphs,
  translations: zxcvbnEn.translations,
});

// Words from the account that must not carry a password: the name's parts
// and the email's local part. Shorter ones ("Ann", "Li") would also match
// inside ordinary words ("planning"), so they are left to zxcvbn's scoring.
export const personalWords = ({ fullName = "", email = "" }) =>
  [...fullName.toLowerCase().split(/\s+/), email.toLowerCase().split("@")[0]]
    .map((word) => word.trim())
    .filter((word) => word.length >= 4);

export const passwordStrength = (password, account = {}) =>
  zxcvbn.check(password, personalWords(account)).score;

const BREACH_API = "https://api.pwnedpasswords.com/range/";
const BREACH_TIMEOUT_MS = 3000;

// Have I Been Pwned with k-anonymity: only the first five hex characters of
// the SHA-1 leave the server; the matching suffixes are compared here.
// Padding hides how many real matches the prefix has. If the service can't
// be reached the password is not blocked (local checks still apply).
export const isBreachedPassword = async (password) => {
  const hash = crypto.createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  try {
    const response = await fetch(`${BREACH_API}${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "convo-password-check" },
      signal: AbortSignal.timeout(BREACH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.text();
    return body.split("\n").some((line) => {
      const [candidate, count] = line.trim().split(":");
      return candidate === suffix && Number(count) > 0;
    });
  } catch (error) {
    logger.warn("Breached password check unavailable", { error: error.message });
    return false;
  }
};

// The first broken rule, as one of PASSWORD_POLICY_ERRORS, or null when the
// password may be used. Cheap local checks run before the network one.
export const passwordPolicyError = async (password, account = {}) => {
  if (password.length < PASSWORD_MIN_LENGTH) return PASSWORD_POLICY_ERRORS.TOO_SHORT;
  if (password.length > PASSWORD_MAX_LENGTH) return PASSWORD_POLICY_ERRORS.TOO_LONG;
  const lower = password.toLowerCase();
  if (personalWords(account).some((word) => lower.includes(word))) return PASSWORD_POLICY_ERRORS.PERSONAL;
  if (passwordStrength(password, account) < PASSWORD_MIN_SCORE) return PASSWORD_POLICY_ERRORS.TOO_WEAK;
  if (await isBreachedPassword(password)) return PASSWORD_POLICY_ERRORS.BREACHED;
  return null;
};
