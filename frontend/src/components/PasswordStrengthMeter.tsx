import { CheckIcon, XIcon } from "lucide-react";
import { usePasswordStrength } from "@/hooks/usePasswordStrength";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MIN_SCORE,
  STRENGTH_LABELS,
  containsPersonalWord,
  type PasswordAccount,
} from "@/utils/passwordPolicy";

// Bar and label colour per zxcvbn score 0-4.
const SCORE_COLORS = ["bg-red-400", "bg-red-400", "bg-amber-400", "bg-cyan-400", "bg-emerald-400"];
const SCORE_TEXT = ["text-red-300", "text-red-300", "text-amber-300", "text-cyan-300", "text-emerald-300"];

interface PasswordStrengthMeterProps {
  id: string;
  password: string;
  account: PasswordAccount;
}

// Live feedback under a new-password field: a four-step bar with a label,
// zxcvbn's hint when it is weak, and the rules the server enforces. The
// rules are text with ✓/✗, so they don't rely on colour.
function PasswordStrengthMeter({ id, password, account }: PasswordStrengthMeterProps) {
  const { result, failed } = usePasswordStrength(password, account);
  const score = result?.score ?? 0;
  const rules = [
    { label: `At least ${PASSWORD_MIN_LENGTH} characters`, met: password.length >= PASSWORD_MIN_LENGTH },
    { label: "Doesn't include your name or email", met: Boolean(password) && !containsPersonalWord(password, account) },
    { label: "Hard to guess (Good or Strong)", met: Boolean(result) && score >= PASSWORD_MIN_SCORE },
  ];

  return (
    <div id={id} className="mt-3 space-y-2">
      {password && !failed && (
        <div>
          <div className="flex gap-1" aria-hidden="true">
            {[1, 2, 3, 4].map((step) => (
              <span
                key={step}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  result && score >= step ? SCORE_COLORS[score] : "bg-slate-700"
                }`}
              />
            ))}
          </div>
          <p aria-live="polite" className="mt-1.5 text-xs text-slate-400">
            {result ? (
              <>
                Strength: <span className={`font-medium ${SCORE_TEXT[score]}`}>{STRENGTH_LABELS[score]}</span>
                {score < PASSWORD_MIN_SCORE && result.warning && <> · {result.warning}</>}
              </>
            ) : (
              "Checking strength…"
            )}
          </p>
        </div>
      )}
      <ul className="space-y-1 text-xs">
        {rules.map(({ label, met }) => (
          <li key={label} className={`flex items-center gap-1.5 ${met ? "text-emerald-300" : "text-slate-400"}`}>
            {met ? (
              <CheckIcon className="size-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <XIcon className="size-3.5 shrink-0" aria-hidden="true" />
            )}
            <span>
              <span className="sr-only">{met ? "Done: " : "Not yet: "}</span>
              {label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default PasswordStrengthMeter;
