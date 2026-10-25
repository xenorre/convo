import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils';
import LoginForm from '../LoginForm';

// Mock the auth store
vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({
    login: vi.fn(),
    isLoggingIn: false,
  }),
}));

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login form correctly', () => {
    render(<LoginForm />);
    
    expect(screen.getByText('Welcome Back')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('johndoe@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows validation errors for empty fields', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    
    const submitButton = screen.getByRole('button', { name: /sign in/i });
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Email is required')).toBeInTheDocument();
      expect(screen.getByText('Password is required')).toBeInTheDocument();
    });
  });

  it('shows validation error for invalid email', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    
    const emailInput = screen.getByPlaceholderText('johndoe@example.com');
    const passwordInput = screen.getByPlaceholderText('••••••••');
    const submitButton = screen.getByRole('button', { name: /sign in/i });
    
    await user.type(emailInput, 'invalid-email');
    await user.type(passwordInput, 'password123'); // Add valid password
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
    });
  });

  it('shows validation error for short password', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    
    const emailInput = screen.getByPlaceholderText('johndoe@example.com');
    const passwordInput = screen.getByPlaceholderText('••••••••');
    const submitButton = screen.getByRole('button', { name: /sign in/i });
    
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, '123');
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Password must be at least 6 characters')).toBeInTheDocument();
    });
  });

  it('clears error when user starts typing', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    
    const emailInput = screen.getByPlaceholderText('johndoe@example.com');
    const submitButton = screen.getByRole('button', { name: /sign in/i });
    
    // Trigger validation error
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Email is required')).toBeInTheDocument();
    });
    
    // Start typing should clear error
    await user.type(emailInput, 't');
    
    await waitFor(() => {
      expect(screen.queryByText('Email is required')).not.toBeInTheDocument();
    });
  });

  it('allows submission with valid data', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    
    const emailInput = screen.getByPlaceholderText('johndoe@example.com');
    const passwordInput = screen.getByPlaceholderText('••••••••');
    const submitButton = screen.getByRole('button', { name: /sign in/i });
    
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    
    // Should not show validation errors with valid data
    expect(screen.queryByText('Email is required')).not.toBeInTheDocument();
    expect(screen.queryByText('Password is required')).not.toBeInTheDocument();
    
    // Button should be enabled
    expect(submitButton).not.toBeDisabled();
  });
});
describe('LoginForm password visibility', () => {
  it('offers a password reset, carrying over the email typed so far', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByPlaceholderText('johndoe@example.com'), 'ann@example.com');
    await user.click(screen.getByRole('link', { name: 'Forgot password?' }));

    expect(window.location.pathname).toBe('/forgot-password');
    expect(window.history.state?.usr).toEqual({ email: 'ann@example.com' });
  });

  it('can show the password while typing it', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    const password = screen.getByLabelText('Password');

    await user.type(password, 'secret phrase');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(password).toHaveValue('secret phrase');

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password).toHaveAttribute('type', 'password');
  });
});

describe('LoginForm with an unconfirmed email', () => {
  it('sends the user to confirm their email first', async () => {
    const { MemoryRouter, Route, Routes, useLocation } = await import('react-router');
    const { render: renderPlain } = await import('@testing-library/react');
    const store = await import('@/store/useAuthStore');
    vi.spyOn(store, 'useAuthStore').mockReturnValue({
      login: vi.fn(async () => ({ unverifiedEmail: 'ann@example.com' })),
      isLoggingIn: false,
    } as never);
    const Probe = () => {
      const state = useLocation().state as { email: string; notConfirmed: boolean };
      return <p>{`confirm ${state.email} ${state.notConfirmed}`}</p>;
    };
    const user = userEvent.setup();
    renderPlain(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginForm />} />
          <Route path="/check-email" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('Email'), 'ann@example.com');
    await user.type(screen.getByLabelText('Password'), 'right-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('confirm ann@example.com true')).toBeInTheDocument();
  });
});
