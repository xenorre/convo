import { useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router";
import { KeyRoundIcon, LoaderCircle, MailCheckIcon, MailIcon } from "lucide-react";
import AuthLayout from "@/AuthLayout";
import { useCountdown } from "@/hooks/useCountdown";
import { apiService } from "@/services/apiService";
import { createApiError } from "@/utils/errorHandling";
import { validateEmail } from "@/utils/sanitize";

// Same wait the server applies between links for one account.
const COOLDOWN_SECONDS = 60;

// Asks for a reset link. The server answers the same way whether or not the
// email has an account, so the page never says which.
function ForgotPassword() {
  // Carried over from the login form, if typed there.
  const typedEmail = (useLocation().state as { email?: string } | null)?.email ?? "";
  const [email, setEmail] = useState(typedEmail);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useCountdown();

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const address = email.trim().toLowerCase();
    if (!validateEmail(address)) {
      setError("Enter the email you signed up with.");
      return;
    }
    setError(null);
    setIsSending(true);
    try {
      await apiService.post("/auth/forgot-password", { email: address });
      setSentTo(address);
      setSecondsLeft(COOLDOWN_SECONDS);
    } catch (sendError) {
      const apiError = createApiError(sendError);
      setError(apiError.status === 429 ? apiError.message : "Couldn't send a link. Try again later.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <AuthLayout>
      {sentTo ? (
        <>
          <div className="mb-7 space-y-3 sm:mb-8">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-500/10">
              <MailCheckIcon className="size-6 text-cyan-400" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Check your email</h1>
            <p className="text-sm leading-relaxed text-slate-400 sm:text-base">
              If an account uses <span className="font-medium text-slate-200">{sentTo}</span>, we sent it a link to
              choose a new password. The link works for 1 hour.
            </p>
            <p className="text-sm leading-relaxed text-slate-400">Can't find it? Check your spam folder.</p>
          </div>
          <div className="space-y-3">
            <button
              type="button"
              className="auth-btn"
              onClick={() => void send()}
              disabled={isSending || secondsLeft > 0}
            >
              {isSending ? "Sending…" : secondsLeft > 0 ? `Send again (${secondsLeft}s)` : "Send again"}
            </button>
            <button
              type="button"
              className="auth-link mx-auto block"
              onClick={() => {
                setSentTo(null);
                setError(null);
              }}
            >
              Use a different email
            </button>
            <p role="status" className="min-h-5 text-sm leading-relaxed text-red-400">
              {error}
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="mb-7 space-y-3 sm:mb-8">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-500/10">
              <KeyRoundIcon className="size-6 text-cyan-400" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Forgot your password?</h1>
            <p className="text-sm leading-relaxed text-slate-400 sm:text-base">
              Enter the email you signed up with and we'll send you a link to choose a new one.
            </p>
          </div>
          <form onSubmit={send} noValidate className="space-y-5">
            <div>
              <label htmlFor="forgot-email" className="auth-input-label">
                Email
              </label>
              <div className="relative">
                <MailIcon className="auth-input-icon" aria-hidden="true" />
                <input
                  id="forgot-email"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoComplete="email"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "forgot-email-error" : undefined}
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (error) setError(null);
                  }}
                  className={`auth-input ${error ? "border-red-500 focus:ring-red-500" : ""}`}
                  placeholder="johndoe@example.com"
                />
              </div>
              {error && (
                <p id="forgot-email-error" role="alert" className="mt-2 text-sm leading-relaxed text-red-400">
                  {error}
                </p>
              )}
            </div>
            <button type="submit" className="auth-btn" disabled={isSending} aria-busy={isSending}>
              {isSending ? (
                <>
                  <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
                  <span className="sr-only">Send reset link</span>
                </>
              ) : (
                "Send reset link"
              )}
            </button>
          </form>
        </>
      )}

      <div className="mt-7 border-t border-slate-600/25 pt-5 text-center">
        <Link to="/login" className="auth-link">
          Back to log in
        </Link>
      </div>
    </AuthLayout>
  );
}

export default ForgotPassword;
