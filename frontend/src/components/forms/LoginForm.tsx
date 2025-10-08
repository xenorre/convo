import { useAuthStore } from "@/store/useAuthStore";
import { useState } from "react";
import { Link } from "react-router";
import { LoaderCircle, LockIcon, MailIcon } from "lucide-react";
import { validateEmail, sanitizeInput } from "@/utils/sanitize";
import toast from "react-hot-toast";

function LoginForm() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<{email?: string; password?: string}>({});
  const { login, isLoggingIn } = useAuthStore();

  const validateForm = () => {
    const newErrors: {email?: string; password?: string} = {};
    
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
      email: sanitizeInput(formData.email).toLowerCase(),
      password: formData.password, // Don't sanitize passwords
    };

    login(sanitizedData);
  };
  return (
    <>
      {" "}
      <div className="space-y-3 mb-10">
        <h1 className="text-3xl font-semibold text-white tracking-tight">
          Welcome Back
        </h1>
        <p className="text-slate-400">Login to access your account</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <div>
          <label className="auth-input-label">Email</label>
          <div className="relative">
            <MailIcon className="auth-input-icon" />
            <input
              type="email"
              value={formData.email}
              onChange={(e) => {
                setFormData({ ...formData, email: e.target.value });
                if (errors.email) {
                  setErrors(prev => ({ ...prev, email: undefined }));
                }
              }}
              className={`input ${errors.email ? 'border-red-500 focus:ring-red-500' : ''}`}
              placeholder="johndoe@example.com"
              autoComplete="email"
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-400">{errors.email}</p>
            )}
          </div>
        </div>

        <div>
          <label className="auth-input-label">Password</label>
          <div className="relative">
            <LockIcon className="auth-input-icon" />
            <input
              type="password"
              value={formData.password}
              onChange={(e) => {
                setFormData({ ...formData, password: e.target.value });
                if (errors.password) {
                  setErrors(prev => ({ ...prev, password: undefined }));
                }
              }}
              className={`input ${errors.password ? 'border-red-500 focus:ring-red-500' : ''}`}
              placeholder="••••••••"
              autoComplete="current-password"
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-400">{errors.password}</p>
            )}
          </div>
        </div>

        <button
          className="auth-btn"
          type="submit"
          disabled={isLoggingIn}
        >
          {isLoggingIn ? <LoaderCircle className="animate-spin" /> : "Sign In"}
        </button>
      </form>
      <div className="mt-6 text-center">
        <Link to="/sign-up" className="auth-link">
          Don't have an account? Sign Up
        </Link>
      </div>
    </>
  );
}

export default LoginForm;
