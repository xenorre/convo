import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { LoaderCircle, MailWarningIcon } from "lucide-react";
import AuthLayout from "@/AuthLayout";
import ResendVerification from "@/components/ResendVerification";
import { useAuthStore } from "@/store/useAuthStore";

// A link works once. Development's double-run effects (and a quick reload)
// must share one request instead of spending the token twice.
const attempts = new Map<string, Promise<boolean>>();

// Where the link in the confirmation email leads.
function VerifyEmail() {
  const [params] = useSearchParams();
  const [token] = useState(() => params.get("token") ?? "");
  const verifyEmail = useAuthStore((state) => state.verifyEmail);
  const navigate = useNavigate();
  const [failed, setFailed] = useState(!token);

  useEffect(() => {
    if (!token) return;
    // Keep the token out of the address bar and history once it's read.
    window.history.replaceState(null, "", "/verify-email");
    if (!attempts.has(token)) attempts.set(token, verifyEmail(token));
    let isCurrent = true;
    void attempts.get(token)!.then((confirmed) => {
      if (!isCurrent) return;
      if (confirmed) navigate("/", { replace: true });
      else setFailed(true);
    });
    return () => {
      isCurrent = false;
    };
  }, [token, verifyEmail, navigate]);

  if (!failed) {
    return (
      <AuthLayout>
        <div role="status" className="flex items-center gap-3 py-10 text-slate-300">
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
          Confirming your email…
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="mb-7 space-y-3 sm:mb-8">
        <div className="flex size-12 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-500/10">
          <MailWarningIcon className="size-6 text-amber-300" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          This link doesn't work
        </h1>
        <p className="text-sm leading-relaxed text-slate-400 sm:text-base">
          It may have expired (links work for 24 hours) or already been used. If your email is already confirmed,
          just log in. Otherwise, enter your email and we'll send a new link.
        </p>
      </div>

      <ResendVerification />

      <div className="mt-7 border-t border-slate-600/25 pt-5 text-center">
        <Link to="/login" className="auth-link">
          Back to log in
        </Link>
      </div>
    </AuthLayout>
  );
}

export default VerifyEmail;
