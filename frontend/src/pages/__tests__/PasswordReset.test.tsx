import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { apiService } from '@/services/apiService';
import { useAuthStore } from '@/store/useAuthStore';
import ForgotPassword from '../ForgotPassword';
import ResetPassword from '../ResetPassword';

vi.mock('@/services/apiService', () => ({ apiService: { get: vi.fn(), post: vi.fn() } }));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
}));

const resetPassword = vi.fn();
const account = { email: 'ann@example.com', fullName: 'Ann Smith' };

const renderAt = (path: string, state?: unknown) => {
  const [pathname, search = ''] = path.split('?');
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[{ pathname, search: search && `?${search}`, state }]}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/" element={<p>Chats</p>} />
          <Route path="/login" element={<p>Login page</p>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
};

describe('forgot password', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the email typed on the login page and sends a link with a cooldown', async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.post).mockResolvedValue({ message: 'ok' });
    renderAt('/forgot-password', { email: 'Ann@Example.com' });

    expect(screen.getByLabelText('Email')).toHaveValue('Ann@Example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(apiService.post).toHaveBeenCalledWith('/auth/forgot-password', { email: 'ann@example.com' });
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText('ann@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send again \(\d+s\)/ })).toBeDisabled();
  });

  it('asks for a valid email before sending anything', async () => {
    const user = userEvent.setup();
    renderAt('/forgot-password');

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter the email you signed up with.');
    expect(apiService.post).not.toHaveBeenCalled();
  });

  it('says when there were too many tries', async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.post).mockRejectedValue({ status: 429, message: 'Too many requests. Try again in 15 minutes.' });
    renderAt('/forgot-password');

    await user.type(screen.getByLabelText('Email'), 'ann@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests. Try again in 15 minutes.');
  });
});

describe('reset password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ resetPassword });
  });

  it("names the account, hides the token from the address bar and signs in with the new password", async () => {
    const user = userEvent.setup();
    const replaceState = vi.spyOn(window.history, 'replaceState');
    vi.mocked(apiService.post).mockResolvedValue(account);
    resetPassword.mockResolvedValue({ kind: 'done' });
    renderAt('/reset-password?token=link-token-1');

    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument();
    expect(screen.getByText('ann@example.com')).toBeInTheDocument();
    expect(apiService.post).toHaveBeenCalledWith('/auth/reset-password/check', { token: 'link-token-1' });
    expect(replaceState).toHaveBeenCalledWith(null, '', '/reset-password');

    await user.type(screen.getByLabelText('New password'), 'copper-lantern-meadow-58');
    await user.click(screen.getByRole('button', { name: 'Save and sign in' }));

    expect(await screen.findByText('Chats')).toBeInTheDocument();
    expect(resetPassword).toHaveBeenCalledExactlyOnceWith('link-token-1', 'copper-lantern-meadow-58');
  });

  it("checks the new password against the account's own name", async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.post).mockResolvedValue(account);
    renderAt('/reset-password?token=link-token-2');

    await user.type(await screen.findByLabelText('New password'), 'smith-copper-lantern-58');
    await user.click(screen.getByRole('button', { name: 'Save and sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Don't use your name or email in your password");
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("shows the server's reason for refusing the password on the field", async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.post).mockResolvedValue(account);
    resetPassword.mockResolvedValue({ kind: 'refused', message: 'This password has appeared in a data breach' });
    renderAt('/reset-password?token=link-token-3');

    await user.type(await screen.findByLabelText('New password'), 'copper-lantern-meadow-58');
    await user.click(screen.getByRole('button', { name: 'Save and sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This password has appeared in a data breach');
    expect(screen.getByLabelText('New password')).toHaveAttribute('aria-invalid', 'true');
  });

  it('explains a used or expired link and offers a new one', async () => {
    vi.mocked(apiService.post).mockRejectedValue({ status: 400, code: 'RESET_INVALID', message: 'x' });
    renderAt('/reset-password?token=used-token');

    expect(await screen.findByRole('heading', { name: "This link doesn't work" })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Send a new link' })).toHaveAttribute('href', '/forgot-password');
  });

  it("doesn't call a link broken when only the check failed, and can try again", async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.post).mockRejectedValueOnce({ status: 0, message: 'Network error' });
    vi.mocked(apiService.post).mockRejectedValueOnce({ status: 0, message: 'Network error' });
    renderAt('/reset-password?token=link-token-4');

    expect(await screen.findByRole('heading', { name: "Couldn't open this link" })).toBeInTheDocument();
    vi.mocked(apiService.post).mockResolvedValue(account);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument());
  });

  it('treats a missing token as a broken link without calling the server', async () => {
    renderAt('/reset-password');

    expect(await screen.findByRole('heading', { name: "This link doesn't work" })).toBeInTheDocument();
    expect(apiService.post).not.toHaveBeenCalled();
  });
});
