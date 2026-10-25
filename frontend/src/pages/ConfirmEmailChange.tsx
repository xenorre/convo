import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { LoaderCircle, MailCheckIcon, MailWarningIcon } from "lucide-react";
import toast from "react-hot-toast";
import AuthLayout from "@/AuthLayout";
import { apiService } from "@/services/apiService";
import { useAuthStore } from "@/store/useAuthStore";
import { createApiError } from "@/utils/errorHandling";

type Outcome =
  | { status: "changed"; email: string; userId: string }
  | { status: "invalid" }
  | { status: "taken" }
  // The request itself failed (network, rate limit); the link may still work.
  | { status: "failed" };

// A link works once. Development's double-run effects (and a quick reload)
// must share one request instead of spending the token twice.
const attempts = new Map<string, Promise<Outcome>>();

const confirm = (token: string): Promise<Outcome> =>
  apiService
    .post<{ email: string; userId: string }>("/auth/confirm-email-change", { token })
    .then(({ email, userId }) => ({ status: "changed", email, userId }) as const)
    .catch((error) => {
      const { code } = createApiError(error);
      if (code === "EMAIL_CHANGE_INVALID") return { status: "invalid" } as const;
      if (code === "EMAIL_CHANGE_EMAIL_TAKEN") return { status: "taken" } as const;
      // Not used up, so trying again is allowed.
      attempts.delete(token);
      return { status: "failed" } as const;
    });

// Where the link in the "confirm your new email" message leads. It works
// signed in or not: the link is often opened on another device.
function ConfirmEmailChange() {
  const [params] = useSearchParams();
  const [token] = useState(() => params.get("token") ?? "");
  const [outcome, setOutcome] = useState<Outcome | null>(token ? null : { status: "invalid" });
  const [attempt, setAttempt] = useState(0);
  const authUser = useAuthStore((state) => state.authUser);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) return;
    // Keep the token out of the address bar and history once it's read.
    window.history.replaceState(null, "", "/confirm-email-change");
    if (!attempts.has(token)) attempts.set(token, confirm(token));
    let isCurrent = true;
    void attempts.get(token)!.then((result) => {
      if (!isCurrent) return;
      // Signed in as this account: back to settings with the new address.
      const { authUser: signedIn, updateAuthUser } = useAuthStore.getState();
      if (result.status === "changed" && signedIn?._id === result.userId) {
        updateAuthUser({ ...signedIn, email: result.email });
        toast.success("Email changed");
        navigate("/settings/account", { replace: true });
        return;
      }
      setOutcome(result);
    });
    return () => {
      isCurrent = false;
    };
  }, [token, attempt, navigate]);

  if (!outcome) {
    return (
      <AuthLayout>
        <div role="status" className="flex items-center gap-3 py-10 text-slate-300">
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
          Confirming your new email…
        </div>
      </AuthLayout>
    );
  }

  const back = authUser ? (
    <Link to="/" className="auth-link">
      Back to Convo
    </Link>
  ) : (
    <Link to="/login" className="auth-link">
      Back to log in
    </Link>
  );

  if (outcome.status === "changed") {
    return (
      <AuthLayout>
        <div className="mb-7 space-y-3 sm:mb-8">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-500/10">
            <MailCheckIcon className="size-6 text-cyan-400" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Email changed</h1>
          <p className="text-sm leading-relaxed text-slate-400 sm:text-base">
            Your account now signs in with <span className="font-medium text-slate-200 [overflow-wrap:anywhere]">{outcome.email}</span>.
          </p>
        </div>
        {authUser ? back : (
          <Link to="/login" className="auth-btn">
            Log in
          </Link>
        )}
      </AuthLayout>
    );
  }

  const message = {
    invalid: {
      title: "This link doesn't work",
      text: "It may have expired (links work for 24 hours), already been used or been replaced by a newer one. You can ask for a new link under Settings, Account.",
    },
    taken: {
      title: "This email is taken",
      text: "Another account started using this address before you confirmed it, so your email stays as it was. Choose a different one under Settings, Account.",
    },
    failed: {
      title: "Couldn't confirm your email",
      text: "Something went wrong on the way. Your link may still work, so try again in a moment.",
    },
  }[outcome.status];

  return (
    <AuthLayout>
      <div className="mb-7 space-y-3 sm:mb-8">
        <div className="flex size-12 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-500/10">
          <MailWarningIcon className="size-6 text-amber-300" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{message.title}</h1>
        <p className="text-sm leading-relaxed text-slate-400 sm:text-base">{message.text}</p>
      </div>
      {outcome.status === "failed" && (
        <button
          type="button"
          className="auth-btn"
          onClick={() => {
            setOutcome(null);
            setAttempt((count) => count + 1);
          }}
        >
          Try again
        </button>
      )}
      <div className="mt-7 border-t border-slate-600/25 pt-5 text-center">{back}</div>
    </AuthLayout>
  );
}

export default ConfirmEmailChange;
