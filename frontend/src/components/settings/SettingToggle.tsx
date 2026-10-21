import { useId, type ReactNode } from "react";

interface SettingToggleProps {
  label: string;
  description?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

// A labelled on/off switch row; the whole label toggles it.
function SettingToggle({ label, description, checked, disabled, onChange }: SettingToggleProps) {
  const id = useId();

  return (
    <div className="flex min-w-0 items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <label
          htmlFor={id}
          className={`block text-sm font-medium text-slate-200 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
        >
          {label}
        </label>
        {description && (
          <p id={`${id}-description`} className="mt-1 text-xs leading-relaxed text-slate-400">
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-description` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        // The after: overlay grows the touch target to 44px without changing the look.
        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-colors after:absolute after:-inset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? "border-cyan-400/40 bg-cyan-500/30" : "border-slate-600/60 bg-slate-700/70"
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block size-5 rounded-full shadow-sm transition-transform ${
            checked ? "translate-x-6 bg-cyan-200" : "translate-x-1 bg-slate-300"
          }`}
        />
      </button>
    </div>
  );
}

export default SettingToggle;
