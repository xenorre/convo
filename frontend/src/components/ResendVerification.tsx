import { useState, type FormEvent } from "react";
import { useCountdown } from "@/hooks/useCountdown";
import { apiService } from "@/services/apiService";
import { createApiError } from "@/utils/errorHandling";
import { validateEmail } from "@/utils/sanitize";

// Same wait the server applies between links for one account.
const COOLDOWN_SECONDS = 60;

interface ResendVerificationProps {
  // Known when coming from sign-up or login; otherwise the user types it.
  email?: string;
}

// "Send a new link". The server answers the same way whether or not it
// sent one, so this says only that a link is on its way if one was due.
function ResendVerification({ email: knownEmail }: ResendVerificationProps) {
  const [email, setEmail] = useState(knownEmail ?? "");
  const [secondsLeft, setSecondsLeft] = useCountdown();
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!validateEmail(email.trim())) {
      setStatus({ tone: "error", text: "Enter the email you signed up with." });
      return;
    }
    setIsSending(true);
    try {
      const response = await apiService.post<{ message: string }>("/auth/resend-verification", {
        email: email.trim().toLowerCase(),
      });
      setStatus({ tone: "info", text: response.message });
      setSecondsLeft(COOLDOWN_SECONDS);
    } catch (error) {
      const apiError = createApiError(error);
      setStatus({
        tone: "error",
        text: apiError.status === 429 ? apiError.message : "Couldn't send a new link. Try again later.",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <form onSubmit={send} noValidate className="space-y-3">
      {!knownEmail && (
        <div>
          <label htmlFor="resend-email" className="auth-input-label">
            Email
          </label>
          <input
            id="resend-email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="auth-input pl-4"
            placeholder="johndoe@example.com"
          />
        </div>
      )}
      <button type="submit" className="auth-btn" disabled={isSending || secondsLeft > 0}>
        {isSending
          ? "Sending…"
          : secondsLeft > 0
            ? `Send a new link (${secondsLeft}s)`
            : "Send a new link"}
      </button>
      <p
        role="status"
        className={`min-h-5 text-sm leading-relaxed ${status?.tone === "error" ? "text-red-400" : "text-slate-400"}`}
      >
        {status?.text}
      </p>
    </form>
  );
}

export default ResendVerification;
