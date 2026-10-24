import { useRef, useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { apiService } from "@/services/apiService";
import { useAuthStore } from "@/store/useAuthStore";
import type { ChangePasswordRequest } from "@/types/api";
import { createApiError, handleStoreError } from "@/utils/errorHandling";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";
import {
  PASSWORD_MAX_LENGTH,
  isPasswordPolicyCode,
  loadStrengthChecker,
  passwordProblem,
  personalWords,
  type PasswordAccount,
} from "@/utils/passwordPolicy";
import {
  primaryButtonClass,
  secondaryButtonClass,
  SettingsCard,
  SettingsSection,
} from "@/components/settings/SettingsSection";

type Field = "current" | "next" | "confirm";
type PasswordForm = Record<Field, string>;
type FieldErrors = Partial<Record<Field, string>>;

const EMPTY_FORM: PasswordForm = { current: "", next: "", confirm: "" };

// The same rules as sign-up; `score` is left out when the strength checker
// couldn't load, and the server judges strength instead.
function validatePasswordForm(
  { current, next, confirm }: PasswordForm,
  account: PasswordAccount,
  score: number | undefined,
): FieldErrors {
  const errors: FieldErrors = {};
  if (!current) errors.current = "Enter your current password.";
  if (current && next === current) {
    errors.next = "Choose a password different from the current one.";
  } else {
    const problem = passwordProblem(next, account, score);
    if (problem) errors.next = problem;
  }
  if (!errors.next && confirm !== next) errors.confirm = "Passwords don't match.";
  return errors;
}

const strengthOf = async (password: string, account: PasswordAccount) => {
  try {
    const check = await loadStrengthChecker();
    return check(password, personalWords(account)).score;
  } catch {
    return undefined;
  }
};

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  error?: string;
  autoComplete: "current-password" | "new-password";
  hint?: string;
  // Another element describing the field, such as a strength meter.
  describedById?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  onChange: (value: string) => void;
}

function PasswordField({ id, label, value, error, autoComplete, hint, describedById, inputRef, onChange }: PasswordFieldProps) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`, describedById].filter(Boolean).join(" ");

  return (
    <div>
      <label htmlFor={id} className="auth-input-label">
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        maxLength={PASSWORD_MAX_LENGTH}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
        className={`auth-input pl-4 ${error ? "border-red-500 focus:ring-red-500" : ""}`}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-2 text-xs text-slate-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

function PasswordCard() {
  const email = useAuthStore((state) => state.authUser?.email ?? "");
  const fullName = useAuthStore((state) => state.authUser?.fullName ?? "");
  const account = { fullName, email };
  const reconnectSocket = useAuthStore((state) => state.reconnectSocket);
  const [form, setForm] = useState<PasswordForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const currentInput = useRef<HTMLInputElement>(null);

  const update = (field: Field) => (value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    if (errors[field]) setErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problems = validatePasswordForm(form, account, await strengthOf(form.next, account));
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;

    setIsSaving(true);
    try {
      const body: ChangePasswordRequest = { currentPassword: form.current, newPassword: form.next };
      await apiService.put("/auth/password", body);
      setForm(EMPTY_FORM);
      toast.success("Password changed");
      // The server moved this browser to a new session; its old socket was closed.
      void reconnectSocket();
    } catch (e) {
      const error = createApiError(e);
      if (error.code === "INVALID_CURRENT_PASSWORD") {
        setErrors({ current: "Current password is incorrect." });
        currentInput.current?.focus();
      } else if (isPasswordPolicyCode(error.code)) {
        // e.g. found in a data breach, which only the server can tell.
        setErrors({ next: error.message });
      } else {
        handleStoreError(e, "Couldn't change your password. Try again later.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsCard
      title="Password"
      description="Changing it also signs out any other copy of your current session."
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {/* Lets password managers attach the new password to the right account. */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <PasswordField
          id="settings-current-password"
          label="Current password"
          value={form.current}
          error={errors.current}
          autoComplete="current-password"
          inputRef={currentInput}
          onChange={update("current")}
        />
        <PasswordField
          id="settings-new-password"
          label="New password"
          value={form.next}
          error={errors.next}
          autoComplete="new-password"
          describedById="settings-new-password-strength"
          onChange={update("next")}
        />
        <PasswordStrengthMeter id="settings-new-password-strength" password={form.next} account={account} />
        <PasswordField
          id="settings-confirm-password"
          label="Confirm new password"
          value={form.confirm}
          error={errors.confirm}
          autoComplete="new-password"
          onChange={update("confirm")}
        />
        <button type="submit" className={primaryButtonClass} disabled={isSaving}>
          {isSaving ? "Changing…" : "Change password"}
        </button>
      </form>
    </SettingsCard>
  );
}

function AccountSettings() {
  const logout = useAuthStore((state) => state.logout);

  return (
    <SettingsSection title="Account" description="Password and sign-in">
      <PasswordCard />
      <SettingsCard
        title="Session"
        description="Convo keeps one active session per account. Signing in on another device signs you out here."
      >
        <button type="button" className={secondaryButtonClass} onClick={() => void logout()}>
          Log out
        </button>
      </SettingsCard>
    </SettingsSection>
  );
}

export default AccountSettings;
