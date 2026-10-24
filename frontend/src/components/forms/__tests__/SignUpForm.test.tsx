import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render as renderPlain, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils';
import { loadStrengthChecker } from '@/utils/passwordPolicy';
import SignUpForm from '../SignUpForm';

const signUp = vi.fn();
vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ signUp, isSigningUp: false }),
}));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
}));

const STRONG = 'violet-anchor-harbor-71';

describe('SignUpForm', () => {
  // Awaited, not returned: a function returned from beforeAll runs as teardown.
  beforeAll(async () => {
    await loadStrengthChecker();
  }, 30_000);

  beforeEach(() => {
    signUp.mockReset();
    signUp.mockResolvedValue(null);
  });

  const fill = async (user: ReturnType<typeof userEvent.setup>, password: string, name = 'Dawid Zalewski') => {
    await user.type(screen.getByLabelText('Full Name'), name);
    await user.type(screen.getByLabelText('Email'), 'dawid@example.com');
    await user.type(screen.getByLabelText('Password'), password);
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
  };

  it('refuses short, personal and easy passwords before calling the server', async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);

    await fill(user, 'short');
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(/^Use at least 12 characters/);

    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'zalewski-rules-2026');
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(/^Don't use your name or email/);

    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'password1234');
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(/^This password is too easy to guess/);

    expect(signUp).not.toHaveBeenCalled();
  });

  it('signs up with a good password and shows a server refusal on the field', async () => {
    const user = userEvent.setup();
    signUp.mockResolvedValue({ kind: 'refused', code: 'PASSWORD_BREACHED', message: 'This password has appeared in a data breach' });
    render(<SignUpForm />);

    await fill(user, STRONG);

    expect(signUp).toHaveBeenCalledWith({ fullName: 'Dawid Zalewski', email: 'dawid@example.com', password: STRONG });
    await waitFor(() =>
      expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(/^This password has appeared in a data breach/));
  });

  it('can show the password while typing it', async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('caps the name at 50 characters, like Settings', async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);

    expect(screen.getByLabelText('Full Name')).toHaveAttribute('maxLength', '50');
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(screen.getByLabelText('Full Name')).toHaveAccessibleDescription('Full name is required');
  });

  it('goes to "check your email" once the account is created', async () => {
    const user = userEvent.setup();
    signUp.mockResolvedValue({ kind: 'verify', email: 'dawid@example.com', emailSent: true });
    const CheckEmailProbe = () => <p>Check page for {(useLocation().state as { email: string }).email}</p>;
    renderPlain(
      <MemoryRouter initialEntries={['/sign-up']}>
        <Routes>
          <Route path="/sign-up" element={<SignUpForm />} />
          <Route path="/check-email" element={<CheckEmailProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await fill(user, STRONG);

    expect(await screen.findByText('Check page for dawid@example.com')).toBeInTheDocument();
  });
});
