import { Link } from 'react-router';
import { useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { LoaderCircle, LockIcon, MailIcon, UserIcon } from 'lucide-react';
import { validateEmail, sanitizeInput } from '@/utils/sanitize';
import toast from 'react-hot-toast';

function SignUpForm() {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
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
      newErrors.fullName = 'Full name is required';
    } else if (formData.fullName.trim().length < 2) {
      newErrors.fullName = 'Full name must be at least 2 characters';
    }

    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fix the errors below');
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
      <div className="space-y-3 mb-10">
        <h1 className="text-3xl font-semibold text-white tracking-tight">
          Create Account
        </h1>
        <p className="text-slate-400">Sign up to get started with Convo</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="auth-input-label">Full Name</label>
          <div className="relative">
            <UserIcon className="auth-input-icon" />
            <input
              type="text"
              value={formData.fullName}
              onChange={e => {
                setFormData({ ...formData, fullName: e.target.value });
                if (errors.fullName) {
                  setErrors(prev => ({ ...prev, fullName: undefined }));
                }
              }}
              className={`input ${errors.fullName ? 'border-red-500 focus:ring-red-500' : ''}`}
              placeholder="John Doe"
              autoComplete="name"
            />
            {errors.fullName && (
              <p className="mt-1 text-sm text-red-400">{errors.fullName}</p>
            )}
          </div>
        </div>

        <div>
          <label className="auth-input-label">Email</label>
          <div className="relative">
            <MailIcon className="auth-input-icon" />
            <input
              type="email"
              value={formData.email}
              onChange={e => {
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
              onChange={e => {
                setFormData({ ...formData, password: e.target.value });
                if (errors.password) {
                  setErrors(prev => ({ ...prev, password: undefined }));
                }
              }}
              className={`input ${errors.password ? 'border-red-500 focus:ring-red-500' : ''}`}
              placeholder="••••••••"
              autoComplete="new-password"
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-400">{errors.password}</p>
            )}
          </div>
        </div>

        <button className="auth-btn" type="submit" disabled={isSigningUp}>
          {isSigningUp ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            'Create Account'
          )}
        </button>
      </form>

      <div className="mt-6 text-center">
        <Link to="/login" className="auth-link">
          Already have an account? Log in
        </Link>
      </div>
    </>
  );
}

export default SignUpForm;
