import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { KeyRoundIcon, LoaderCircle, LockIcon, MailWarningIcon } from "lucide-react";
import AuthLayout from "@/AuthLayout";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";
import PasswordVisibilityToggle from "@/components/forms/PasswordVisibilityToggle";
import { apiService } from "@/services/apiService";
import { useAuthStore } from "@/store/useAuthStore";
import { createApiError } from "@/utils/errorHandling";
import { PASSWORD_MAX_LENGTH, passwordProblem, strengthScore, type PasswordAccount } from "@/utils/passwordPolicy";

type LinkState =
  | { status: "checking" }
  | { status: "ready"; account: Required<PasswordAccount> }
  | { status: "invalid" }
  // The check itself failed (network, rate limit), not the link.
  | { status: "unavailable" };

// Where the link in the reset email leads. Checking the link doesn't use it
// up, so it can run again (development's double effects, a reload).
function ResetPassword() {
  const [params] = useSearchParams();
  const [token] = useState(() => params.get("token") ?? "");
  const [link, setLink] = useState<LinkState>(token ? { status: "checking" } : { status: "invalid" });
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const resetPassword = useAuthStore((state) => state.resetPassword);
  const navigate = useNavigate();

  const checkLink = useCallback(async () => {
    try {
      const account = await apiService.post<Required<PasswordAccount>>("/auth/reset-password/check", { token });
      return { status: "ready", account: { email: account.email, fullName: account.fullName } } as const;
    } catch (checkError) {
      return { status: createApiError(checkError).code === "RESET_INVALID" ? "invalid" : "unavailable" } as const;
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    // Keep the token out of the address bar and history once it's read.
    window.history.replaceState(null, "", "/reset-password");
    let isCurrent = true;
    void checkLink().then((state) => {
      if (isCurrent) setLink(state);
    });
    return () => {
      isCurrent = false;
    };
  }, [token, checkLink]);

  const retryCheck = async () => {
    setLink({ status: "checking" });
    setLink(await checkLink());
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (link.status !== "ready") return;
    if (!password) {
      setError("Enter a new password");
      return;
    }
    setIsSaving(true);
    const problem = passwordProblem(password, link.account, await strengthScore(password, link.account));
    if (problem) {
      setError(problem);
      setIsSaving(false);
      return;
    }
    const outcome = await resetPassword(token, password);
    setIsSaving(false);
    if (outcome?.kind === "done") navigate("/", { replace: true });
    else if (outcome?.kind === "refused") setError(outcome.message);
    else if (outcome?.kind === "invalid") setLink({ status: "invalid" });
  };

  if (link.status === "checking") {
    return (
      <AuthLayout>
        <div role="status" className="flex items-center gap-3 py-10 text-slate-300">
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
          Checking your link…
        </div>
      </AuthLayout>
    );
  }

  if (link.status !== "ready") {
    const unavailable = link.status === "unavailable";
    return (
      <AuthLayout>
        <div className="mb-7 space-y-3 sm:mb-8">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-500/10">
            <MailWarningIcon className="size-6 text-amber-300" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {unavailable ? "Couldn't open this link" : "This link doesn't work"}
          </h1>
          <p className="text-sm leading-relaxed text-slate-400 sm:text-base">
            {unavailable
              ? "Something went wrong while checking it. Your link may still work, so try again in a moment."
              : "It may have expired (links work for 1 hour) or already been used. Ask for a new one and use the latest email."}
          </p>
        </div>
        {unavailable ? (
          <button type="button" className="auth-btn" onClick={() => void retryCheck()}>
            Try again
          </button>
        ) : (
          <Link to="/forgot-password" className="auth-btn">
            Send a new link
          </Link>
        )}
        <div className="mt-7 border-t border-slate-600/25 pt-5 text-center">
          <Link to="/login" className="auth-link">
            Back to log in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="mb-7 space-y-3 sm:mb-8">
        <div className="flex size-12 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-500/10">
          <KeyRoundIcon className="size-6 text-cyan-400" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Choose a new password</h1>
        <p className="text-sm leading-relaxed text-slate-400 sm:text-base">
          For <span className="font-medium text-slate-200">{link.account.email}</span>. You'll be signed in, and
          signed out everywhere else.
        </p>
      </div>

      <form onSubmit={submit} noValidate className="space-y-5">
        {/* Lets password managers save the new password under the right account. */}
        <input type="email" name="email" autoComplete="username" value={link.account.email} readOnly hidden />
        <div>
          <label htmlFor="reset-password" className="auth-input-label">
            New password
          </label>
          <div className="relative">
            <LockIcon className="auth-input-icon" aria-hidden="true" />
            <input
              id="reset-password"
              name="password"
              type={showPassword ? "text" : "password"}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "reset-password-error reset-password-strength" : "reset-password-strength"}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (error) setError(null);
              }}
              className={`auth-input pr-12 ${error ? "border-red-500 focus:ring-red-500" : ""}`}
              placeholder="••••••••••••"
              autoComplete="new-password"
              autoFocus
              maxLength={PASSWORD_MAX_LENGTH}
            />
            <PasswordVisibilityToggle shown={showPassword} onToggle={() => setShowPassword((shown) => !shown)} />
          </div>
          {error && (
            <p id="reset-password-error" role="alert" className="mt-2 text-sm leading-relaxed text-red-400">
              {error}
            </p>
          )}
          <PasswordStrengthMeter id="reset-password-strength" password={password} account={link.account} />
        </div>
        <button type="submit" className="auth-btn" disabled={isSaving} aria-busy={isSaving}>
          {isSaving ? (
            <>
              <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
              <span className="sr-only">Save and sign in</span>
            </>
          ) : (
            "Save and sign in"
          )}
        </button>
      </form>

      <div className="mt-7 border-t border-slate-600/25 pt-5 text-center">
        <Link to="/login" className="auth-link">
          Back to log in
        </Link>
      </div>
    </AuthLayout>
  );
}

export default ResetPassword;
