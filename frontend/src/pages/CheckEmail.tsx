import { Link, useLocation } from "react-router";
import { MailCheckIcon } from "lucide-react";
import AuthLayout from "@/AuthLayout";
import ResendVerification from "@/components/ResendVerification";

interface CheckEmailState {
  email?: string;
  // Arrived from a login with the right password but an unconfirmed email.
  notConfirmed?: boolean;
  // false when sign-up couldn't send the first email.
  emailSent?: boolean;
}

// After sign-up, or a login that needs the email confirmed first.
function CheckEmail() {
  const { email, notConfirmed, emailSent } = (useLocation().state ?? {}) as CheckEmailState;
  const sendFailed = emailSent === false;

  return (
    <AuthLayout>
      <div className="mb-7 space-y-3 sm:mb-8">
        <div className="flex size-12 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-500/10">
          <MailCheckIcon className="size-6 text-cyan-400" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          {sendFailed ? "Almost there" : notConfirmed ? "Confirm your email first" : "Check your email"}
        </h1>
        {sendFailed ? (
          <p role="alert" className="text-sm leading-relaxed text-amber-300 sm:text-base">
            Your account is ready, but we couldn't send the confirmation email
            {email && (
              <>
                {" "}to <span className="font-medium text-amber-200">{email}</span>
              </>
            )}
            . Try "Send a new link" in a moment.
          </p>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-slate-400 sm:text-base">
              {email ? (
                <>
                  We sent a confirmation link to <span className="font-medium text-slate-200">{email}</span>.
                </>
              ) : (
                "We sent a confirmation link to the email you signed up with."
              )}{" "}
              Open it to confirm your address and you'll be signed in. The link works for 24 hours.
            </p>
            <p className="text-sm leading-relaxed text-slate-400">
              Can't find it? Check your spam folder, or send a new link.
            </p>
          </>
        )}
      </div>

      <ResendVerification email={email} />

      <div className="mt-7 border-t border-slate-600/25 pt-5 text-center">
        <Link to="/login" className="auth-link">
          Back to log in
        </Link>
      </div>
    </AuthLayout>
  );
}

export default CheckEmail;
