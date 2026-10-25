// Mirrors backend/src/services/password.service.js so problems show while
// typing; the server still checks everything, plus known data breaches.
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
// zxcvbn scores 0-4; the server requires at least this.
export const PASSWORD_MIN_SCORE = 3;

export const STRENGTH_LABELS = ["Very weak", "Weak", "Fair", "Good", "Strong"] as const;

export interface PasswordAccount {
  fullName?: string;
  email?: string;
}

// The name's parts and the email's local part, as on the server.
export const personalWords = ({ fullName = "", email = "" }: PasswordAccount) =>
  [...fullName.toLowerCase().split(/\s+/), email.toLowerCase().split("@")[0]]
    .map((word) => word.trim())
    .filter((word) => word.length >= 4);

export const containsPersonalWord = (password: string, account: PasswordAccount) => {
  const lower = password.toLowerCase();
  return personalWords(account).some((word) => lower.includes(word));
};

export interface StrengthResult {
  score: number;
  // zxcvbn's hint for weak passwords, e.g. "This is a very common password."
  warning: string;
  suggestions: string[];
}

type Checker = (password: string, userInputs: string[]) => StrengthResult;

// The dictionaries are large, so they load only where a new password is typed.
let checker: Promise<Checker> | null = null;
export const loadStrengthChecker = () => {
  checker ??= Promise.all([
    import("@zxcvbn-ts/core"),
    import("@zxcvbn-ts/language-common"),
    import("@zxcvbn-ts/language-en"),
  ])
    .then(([{ ZxcvbnFactory }, common, en]) => {
      const zxcvbn = new ZxcvbnFactory({
        dictionary: { ...common.dictionary, ...en.dictionary },
        graphs: common.adjacencyGraphs,
        translations: en.translations,
      });
      return (password: string, userInputs: string[]) => {
        const { score, feedback } = zxcvbn.check(password, userInputs);
        return { score, warning: feedback.warning ?? "", suggestions: feedback.suggestions };
      };
    })
    .catch((error) => {
      // A failed chunk load may succeed on the next try.
      checker = null;
      throw error;
    });
  return checker;
};

// The zxcvbn score for a submitted password, or undefined when the checker
// can't load; the server still judges strength then.
export const strengthScore = async (password: string, account: PasswordAccount) => {
  try {
    const check = await loadStrengthChecker();
    return check(password, personalWords(account)).score;
  } catch {
    return undefined;
  }
};

// The first rule a new password breaks, in the server's words, or null.
// Strength is only judged once the checker has loaded (`score` given).
export function passwordProblem(password: string, account: PasswordAccount, score?: number): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters`;
  if (containsPersonalWord(password, account)) return "Don't use your name or email in your password";
  if (score !== undefined && score < PASSWORD_MIN_SCORE) {
    return "This password is too easy to guess. Try a longer phrase of unrelated words";
  }
  return null;
}

// Server codes for a refused password, so a form can show them on the field.
export const isPasswordPolicyCode = (code: string | undefined) => Boolean(code?.startsWith("PASSWORD_"));
