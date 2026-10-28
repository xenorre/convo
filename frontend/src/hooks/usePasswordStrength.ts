import { useEffect, useMemo, useState } from "react";
import { loadStrengthChecker, personalWords, type PasswordAccount, type StrengthResult } from "@/utils/passwordPolicy";

// Scores lightly after typing pauses; zxcvbn on every keystroke of a long
// password is noticeable on slow phones.
const SCORE_DELAY_MS = 150;

// The strength of `password` for this account, or null while it is empty
// or the checker is still loading.
export function usePasswordStrength(password: string, { fullName, email }: PasswordAccount) {
  const [result, setResult] = useState<StrengthResult | null>(null);
  const [failed, setFailed] = useState(false);
  const userInputs = useMemo(() => personalWords({ fullName, email }), [fullName, email]);

  // A cleared field forgets the old score, so it doesn't flash back when
  // typing starts again (adjusted during render, as React recommends).
  const [scoredPassword, setScoredPassword] = useState(password);
  if (password !== scoredPassword) {
    setScoredPassword(password);
    if (!password) setResult(null);
  }

  useEffect(() => {
    if (!password) return;
    let isCurrent = true;
    const timer = setTimeout(() => {
      loadStrengthChecker()
        .then((check) => {
          if (isCurrent) setResult(check(password, userInputs));
        })
        .catch(() => {
          // Without the meter the server still enforces every rule.
          if (isCurrent) setFailed(true);
        });
    }, SCORE_DELAY_MS);
    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [password, userInputs]);

  return { result: password ? result : null, failed };
}
