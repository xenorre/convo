import { Link } from "react-router";
import { useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { LoaderCircle, LockIcon, MailIcon, UserIcon } from "lucide-react";
import { validateEmail, sanitizeInput } from "@/utils/sanitize";
import toast from "react-hot-toast";

function SignUpForm() {
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
  }>({});
  const { signUp, isSigningUp } = useAuthStore();

  const validateForm = () => {
    const newErrors: { fullName?: string; email?: string; password?: string } =
      {};

    if (!formData.fullName?.trim()) {
      newErrors.fullName = "Full name is required";
    } else if (formData.fullName.trim().length < 2) {
      newErrors.fullName = "Full name must be at least 2 characters";
    }

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

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Please fix the errors below");
      return;
    }

    const sanitizedData = {
      fullName: sanitizeInput(formData.fullName).trim(),
      email: sanitizeInput(formData.email).toLowerCase(),
      password: formData.password, // Don't sanitize passwords
    };

    signUp(sanitizedData);
  };
  return (
    <>
      <div className="mb-7 space-y-2 sm:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Create Account
        </h1>
        <p className="text-sm text-slate-400 sm:text-base">
          Sign up to get started with Convo
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="signup-full-name" className="auth-input-label">
            Full Name
          </label>
          <div className="relative">
            <UserIcon className="auth-input-icon" aria-hidden="true" />
            <input
              id="signup-full-name"
              name="fullName"
              type="text"
              aria-invalid={Boolean(errors.fullName)}
              aria-describedby={
                errors.fullName ? "signup-full-name-error" : undefined
              }
              value={formData.fullName}
              onChange={(e) => {
                setFormData({ ...formData, fullName: e.target.value });
                if (errors.fullName) {
                  setErrors((prev) => ({ ...prev, fullName: undefined }));
                }
              }}
              className={`auth-input ${errors.fullName ? "border-red-500 focus:ring-red-500" : ""}`}
              placeholder="John Doe"
              autoComplete="name"
            />
          </div>
          {errors.fullName && (
            <p
              id="signup-full-name-error"
              role="alert"
              className="mt-2 text-sm leading-relaxed text-red-400"
            >
              {errors.fullName}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="signup-email" className="auth-input-label">
            Email
          </label>
          <div className="relative">
            <MailIcon className="auth-input-icon" aria-hidden="true" />
            <input
              id="signup-email"
              name="email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "signup-email-error" : undefined}
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
              id="signup-email-error"
              role="alert"
              className="mt-2 text-sm leading-relaxed text-red-400"
            >
              {errors.email}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="signup-password" className="auth-input-label">
            Password
          </label>
          <div className="relative">
            <LockIcon className="auth-input-icon" aria-hidden="true" />
            <input
              id="signup-password"
              name="password"
              type="password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={
                errors.password ? "signup-password-error" : undefined
              }
              value={formData.password}
              onChange={(e) => {
                setFormData({ ...formData, password: e.target.value });
                if (errors.password) {
                  setErrors((prev) => ({ ...prev, password: undefined }));
                }
              }}
              className={`auth-input ${errors.password ? "border-red-500 focus:ring-red-500" : ""}`}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>
          {errors.password && (
            <p
              id="signup-password-error"
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
          disabled={isSigningUp}
          aria-busy={isSigningUp}
        >
          {isSigningUp ? (
            <>
              <LoaderCircle
                className="size-5 animate-spin"
                aria-hidden="true"
              />
              <span className="sr-only">Create Account</span>
            </>
          ) : (
            "Create Account"
          )}
        </button>
      </form>

      <div className="mt-7 border-t border-slate-600/25 pt-5 text-center">
        <Link to="/login" className="auth-link">
          Already have an account? Log in
        </Link>
      </div>
    </>
  );
}

export default SignUpForm;
