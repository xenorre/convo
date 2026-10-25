import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import toast from "react-hot-toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { apiService } from "@/services/apiService";
import { useAuthStore } from "@/store/useAuthStore";
import type { ChangePasswordRequest, EmailSettingsResponse, PendingEmailChange } from "@/types/api";
import { validateEmail } from "@/utils/sanitize";
import { formatFullTimestamp } from "@/utils/chatTimestamp";
import { createApiError, handleStoreError } from "@/utils/errorHandling";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";
import PasswordVisibilityToggle from "@/components/forms/PasswordVisibilityToggle";
import {
  PASSWORD_MAX_LENGTH,
  isPasswordPolicyCode,
  passwordProblem,
  strengthScore,
  type PasswordAccount,
} from "@/utils/passwordPolicy";
import {
  dangerButtonClass,
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
  const [shown, setShown] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="auth-input-label">
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type={shown ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          maxLength={PASSWORD_MAX_LENGTH}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy || undefined}
          className={`auth-input pl-4 pr-12 ${error ? "border-red-500 focus:ring-red-500" : ""}`}
        />
        <PasswordVisibilityToggle
          shown={shown}
          onToggle={() => setShown((isShown) => !isShown)}
          fieldName={label.toLowerCase()}
        />
      </div>
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

type EmailField = "newEmail" | "password";

// Changing the sign-in email: the password now, then the link sent to the
// new address. Until it is opened, the current email keeps working.
function EmailCard() {
  const email = useAuthStore((state) => state.authUser?.email ?? "");
  const [pending, setPending] = useState<PendingEmailChange | null>(null);
  const [form, setForm] = useState<Record<EmailField, string>>({ newEmail: "", password: "" });
  const [errors, setErrors] = useState<Partial<Record<EmailField, string>>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const passwordInput = useRef<HTMLInputElement>(null);

  // Read again when the email changes, e.g. confirmed on another device.
  useEffect(() => {
    let isCurrent = true;
    apiService
      .get<EmailSettingsResponse>("/users/me/email")
      .then((settings) => {
        if (isCurrent) setPending(settings.pending);
      })
      // Without it the card still works; only the waiting change isn't shown.
      .catch(() => {});
    return () => {
      isCurrent = false;
    };
  }, [email]);

  const update = (field: EmailField) => (value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    if (errors[field]) setErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const newEmail = form.newEmail.trim().toLowerCase();
    const problems: Partial<Record<EmailField, string>> = {};
    if (!validateEmail(newEmail)) problems.newEmail = "Enter a valid email address.";
    else if (newEmail === email) problems.newEmail = "That's already your email.";
    if (!form.password) problems.password = "Enter your password.";
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;

    setIsSaving(true);
    try {
      const response = await apiService.post<{ pending: PendingEmailChange }>("/users/me/email", {
        newEmail,
        password: form.password,
      });
      setPending(response.pending);
      setForm({ newEmail: "", password: "" });
    } catch (e) {
      const error = createApiError(e);
      if (error.code === "EMAIL_CHANGE_INVALID_PASSWORD") {
        setErrors({ password: `${error.message}.` });
        passwordInput.current?.focus();
      } else if (error.code?.startsWith("EMAIL_CHANGE_") || error.status === 400) {
        // Taken, the same as now, or a link sent there a moment ago.
        setErrors({ newEmail: `${error.message}.` });
      } else {
        handleStoreError(e, "Couldn't send the confirmation email. Try again later.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const cancel = async () => {
    setIsCancelling(true);
    try {
      await apiService.delete("/users/me/email/pending");
      setPending(null);
    } catch (e) {
      handleStoreError(e, "Couldn't cancel the change. Try again later.");
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <SettingsCard title="Email" description="You sign in with it, and it's where Convo sends account emails.">
      <p className="break-all text-sm text-slate-200">{email}</p>

      {pending && (
        <div role="status" className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-500/5 p-3 text-sm leading-relaxed text-slate-300">
          <p>
            Waiting for you to confirm <span className="font-medium text-slate-100 [overflow-wrap:anywhere]">{pending.email}</span>.
            Open the link we sent there to finish. Until then you keep signing in with your current email.
          </p>
          <p className="mt-1 text-xs text-slate-400">The link works until {formatFullTimestamp(pending.expiresAt)}.</p>
          <button
            type="button"
            className={`${secondaryButtonClass} mt-3`}
            disabled={isCancelling}
            onClick={() => void cancel()}
          >
            {isCancelling ? "Cancelling…" : "Cancel change"}
          </button>
        </div>
      )}

      <form onSubmit={submit} noValidate className="mt-4 space-y-4">
        <div>
          <label htmlFor="settings-new-email" className="auth-input-label">
            New email
          </label>
          <input
            id="settings-new-email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            autoComplete="email"
            value={form.newEmail}
            onChange={(event) => update("newEmail")(event.target.value)}
            aria-invalid={Boolean(errors.newEmail)}
            aria-describedby={errors.newEmail ? "settings-new-email-error" : undefined}
            className={`auth-input pl-4 ${errors.newEmail ? "border-red-500 focus:ring-red-500" : ""}`}
          />
          {errors.newEmail && (
            <p id="settings-new-email-error" role="alert" className="mt-2 text-sm text-red-300">
              {errors.newEmail}
            </p>
          )}
        </div>
        <PasswordField
          id="settings-email-password"
          label="Password"
          value={form.password}
          error={errors.password}
          autoComplete="current-password"
          inputRef={passwordInput}
          onChange={update("password")}
        />
        <button type="submit" className={primaryButtonClass} disabled={isSaving}>
          {isSaving ? "Sending…" : pending ? "Send a new link" : "Send confirmation link"}
        </button>
      </form>
    </SettingsCard>
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
    const problems = validatePasswordForm(form, account, await strengthScore(form.next, account));
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

// A copy of everything stored about the account, saved as a JSON file.
function DataExportCard() {
  const [isExporting, setIsExporting] = useState(false);

  const download = async () => {
    setIsExporting(true);
    try {
      const data = await apiService.get<unknown>("/users/me/export");
      const file = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = `convo-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      // Some browsers start the download only after the click returns.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (e) {
      handleStoreError(e, "Couldn't prepare your data. Try again later.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <SettingsCard
      title="Your data"
      description="Download a copy of your profile, friends, settings and every message as a JSON file. Photos and files are included as links."
    >
      <button type="button" className={secondaryButtonClass} disabled={isExporting} onClick={() => void download()}>
        {isExporting ? "Preparing…" : "Download my data"}
      </button>
    </SettingsCard>
  );
}

// The password first, then a dialog that says exactly what goes.
function DeleteAccountCard() {
  const email = useAuthStore((state) => state.authUser?.email ?? "");
  const deleteAccount = useAuthStore((state) => state.deleteAccount);
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const passwordInput = useRef<HTMLInputElement>(null);

  const ask = (event: FormEvent) => {
    event.preventDefault();
    if (!password) {
      setError("Enter your password to continue.");
      passwordInput.current?.focus();
      return;
    }
    setIsConfirming(true);
  };

  const confirm = async () => {
    setIsDeleting(true);
    const outcome = await deleteAccount(password);
    if (outcome?.kind === "deleted") {
      navigate("/login", { replace: true });
      return;
    }
    setIsDeleting(false);
    setIsConfirming(false);
    if (outcome?.kind === "wrong-password") {
      setError("Password is incorrect.");
      passwordInput.current?.focus();
    }
  };

  return (
    <SettingsCard
      title="Delete account"
      description="Deletes your account right away. This can't be undone, so download your data first if you want to keep it."
    >
      <form onSubmit={ask} noValidate className="space-y-4">
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <PasswordField
          id="settings-delete-password"
          label="Your password"
          value={password}
          error={error}
          autoComplete="current-password"
          inputRef={passwordInput}
          onChange={(value) => {
            setPassword(value);
            if (error) setError(undefined);
          }}
        />
        <button type="submit" className={dangerButtonClass}>
          Delete account
        </button>
      </form>
      {isConfirming && (
        <ConfirmDialog
          title="Delete your account?"
          // Opens where "Delete account" was; a double click must not answer it.
          confirmDelayMs={600}
          actions={[{ label: isDeleting ? "Deleting…" : "Delete forever", onSelect: () => void confirm() }]}
          isBusy={isDeleting}
          onCancel={() => setIsConfirming(false)}
        >
          <p>This can't be undone. Right away:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>your profile, photo, friends and settings are deleted,</li>
            <li>files and photos you sent are deleted,</li>
            <li>you're signed out on every device.</li>
          </ul>
          <p>Messages you sent stay in other people's chats, shown as from "Deleted account".</p>
        </ConfirmDialog>
      )}
    </SettingsCard>
  );
}

function AccountSettings() {
  const logout = useAuthStore((state) => state.logout);

  return (
    <SettingsSection title="Account" description="Password, sign-in and your data">
      <EmailCard />
      <PasswordCard />
      <SettingsCard
        title="Session"
        description="Convo keeps one active session per account. Signing in on another device signs you out here."
      >
        <button type="button" className={secondaryButtonClass} onClick={() => void logout()}>
          Log out
        </button>
      </SettingsCard>
      <DataExportCard />
      <DeleteAccountCard />
    </SettingsSection>
  );
}

export default AccountSettings;
