import { EyeIcon, EyeOffIcon } from "lucide-react";

interface PasswordVisibilityToggleProps {
  shown: boolean;
  onToggle: () => void;
  // Names the field when a page has several, e.g. "new password".
  fieldName?: string;
}

// Eye button at the right end of a password field (give the input pr-12).
// Seeing what was typed helps with long passphrases and on phones.
function PasswordVisibilityToggle({ shown, onToggle, fieldName = "password" }: PasswordVisibilityToggleProps) {
  return (
    <button
      type="button"
      aria-label={`${shown ? "Hide" : "Show"} ${fieldName}`}
      aria-pressed={shown}
      onClick={onToggle}
      className="absolute right-1 top-1/2 inline-flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-cyan-400"
    >
      {shown ? <EyeOffIcon className="size-5" aria-hidden="true" /> : <EyeIcon className="size-5" aria-hidden="true" />}
    </button>
  );
}

export default PasswordVisibilityToggle;
