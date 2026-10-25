import { useAuthStore } from "@/store/useAuthStore";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { LoaderCircle, LockIcon, MailIcon } from "lucide-react";
import PasswordVisibilityToggle from "./PasswordVisibilityToggle";
import { validateEmail, sanitizeInput } from "@/utils/sanitize";
import toast from "react-hot-toast";

function LoginForm() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {},
  );
  const { login, isLoggingIn } = useAuthStore();
  const navigate = useNavigate();

  const validateForm = () => {
    const newErrors: { email?: string; password?: string } = {};

    if (!formData.email) {
      newErrors.email = "Email is required";
    } else if (!validateEmail(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Please fix the errors below");
      return;
    }

    const sanitizedData = {
      email: sanitizeInput(formData.email).toLowerCase(),
      password: formData.password, // Don't sanitize passwords
    };

    const outcome = await login(sanitizedData);
    if (outcome) {
      navigate("/check-email", { state: { email: outcome.unverifiedEmail, notConfirmed: true } });
    }
  };
  return (
    <>
      <div className="mb-7 space-y-2 sm:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Welcome Back
        </h1>
        <p className="text-sm text-slate-400 sm:text-base">
          Login to access your account
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div>
          <label htmlFor="login-email" className="auth-input-label">
            Email
          </label>
          <div className="relative">
            <MailIcon className="auth-input-icon" aria-hidden="true" />
            <input
              id="login-email"
              name="email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "login-email-error" : undefined}
              value={formData.email}
              onChange={(e) => {
                setFormData({ ...formData, email: e.target.value });
                if (errors.email) {
                  setErrors((prev) => ({ ...prev, email: undefined }));
                }
              }}
              className={`auth-input ${errors.email ? "border-red-500 focus:ring-red-500" : ""}`}
              placeholder="johndoe@example.com"
              autoComplete="email"
            />
          </div>
          {errors.email && (
            <p
              id="login-email-error"
              role="alert"
              className="mt-2 text-sm leading-relaxed text-red-400"
            >
              {errors.email}
            </p>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label htmlFor="login-password" className="auth-input-label mb-0">
              Password
            </label>
            {/* A full 44px touch target that doesn't push the field down. */}
            <Link
              to="/forgot-password"
              state={{ email: formData.email.trim() }}
              className="-my-3 inline-flex min-h-11 items-center rounded-lg px-1 text-sm text-cyan-400 transition-colors hover:text-cyan-300"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <LockIcon className="auth-input-icon" aria-hidden="true" />
            <input
              id="login-password"
              name="password"
              type={showPassword ? "text" : "password"}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={
                errors.password ? "login-password-error" : undefined
              }
              value={formData.password}
              onChange={(e) => {
                setFormData({ ...formData, password: e.target.value });
                if (errors.password) {
                  setErrors((prev) => ({ ...prev, password: undefined }));
                }
              }}
              className={`auth-input pr-12 ${errors.password ? "border-red-500 focus:ring-red-500" : ""}`}
              placeholder="••••••••"
              autoComplete="current-password"
            />
            <PasswordVisibilityToggle shown={showPassword} onToggle={() => setShowPassword((shown) => !shown)} />
          </div>
          {errors.password && (
            <p
              id="login-password-error"
              role="alert"
              className="mt-2 text-sm leading-relaxed text-red-400"
            >
              {errors.password}
            </p>
          )}
        </div>

        <button
          className="auth-btn"
          type="submit"
          disabled={isLoggingIn}
          aria-busy={isLoggingIn}
        >
          {isLoggingIn ? (
            <>
              <LoaderCircle
                className="size-5 animate-spin"
                aria-hidden="true"
              />
              <span className="sr-only">Sign In</span>
            </>
          ) : (
            "Sign In"
          )}
        </button>
      </form>
      <div className="mt-7 border-t border-slate-600/25 pt-5 text-center">
        <Link to="/sign-up" className="auth-link">
          Don't have an account? Sign Up
        </Link>
      </div>
    </>
  );
}

export default LoginForm;
