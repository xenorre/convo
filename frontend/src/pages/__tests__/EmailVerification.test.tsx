import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { apiService } from '@/services/apiService';
import { useAuthStore } from '@/store/useAuthStore';
import VerifyEmail from '../VerifyEmail';
import CheckEmail from '../CheckEmail';

vi.mock('@/services/apiService', () => ({ apiService: { get: vi.fn(), post: vi.fn() } }));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
}));

const verifyEmail = vi.fn();

const renderAt = (path: string, state?: unknown) =>
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[{ pathname: path.split('?')[0], search: path.includes('?') ? `?${path.split('?')[1]}` : '', state }]}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/check-email" element={<CheckEmail />} />
          <Route path="/" element={<p>Chats</p>} />
          <Route path="/login" element={<p>Login page</p>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );

describe('email confirmation pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ verifyEmail });
  });
  afterEach(() => vi.useRealTimers());

  it('confirms the link once, even with double-run effects, and opens the app', async () => {
    verifyEmail.mockResolvedValue(true);
    renderAt('/verify-email?token=link-token-1');

    expect(await screen.findByText('Chats')).toBeInTheDocument();
    expect(verifyEmail).toHaveBeenCalledExactlyOnceWith('link-token-1');
  });

  it('explains a used or expired link and offers a new one', async () => {
    verifyEmail.mockResolvedValue(false);
    renderAt('/verify-email?token=link-token-2');

    expect(await screen.findByRole('heading', { name: "This link doesn't work" })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send a new link' })).toBeInTheDocument();
  });

  it('treats a missing token as a broken link without calling the server', async () => {
    renderAt('/verify-email');

    expect(await screen.findByRole('heading', { name: "This link doesn't work" })).toBeInTheDocument();
    expect(verifyEmail).not.toHaveBeenCalled();
  });

  it('after sign-up, names the address and sends a new link with a cooldown', async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.post).mockResolvedValue({ message: 'If that account still needs confirming, a new link is on its way.' });
    renderAt('/check-email', { email: 'ann@example.com' });

    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText('ann@example.com')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Send a new link' }));

    expect(apiService.post).toHaveBeenCalledWith('/auth/resend-verification', { email: 'ann@example.com' });
    expect(await screen.findByRole('status')).toHaveTextContent('a new link is on its way');
    expect(screen.getByRole('button', { name: /Send a new link \(\d+s\)/ })).toBeDisabled();
  });

  it('says plainly when the first email could not be sent', () => {
    renderAt('/check-email', { email: 'ann@example.com', emailSent: false });

    expect(screen.getByRole('heading', { name: 'Almost there' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent("couldn't send the confirmation email to ann@example.com");
    expect(screen.queryByText(/Check your spam folder/)).toBeNull();
  });

  it('after a login that needs confirming, says so', () => {
    renderAt('/check-email', { email: 'ann@example.com', notConfirmed: true });

    expect(screen.getByRole('heading', { name: 'Confirm your email first' })).toBeInTheDocument();
  });

  it('asks for the email when it is not known, and shows rate limits', async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.post).mockRejectedValue({ status: 429, message: 'Too many requests. Try again later.' });
    renderAt('/check-email');

    await user.click(screen.getByRole('button', { name: 'Send a new link' }));
    expect(screen.getByRole('status')).toHaveTextContent('Enter the email you signed up with.');
    expect(apiService.post).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Email'), 'Ann@Example.com ');
    await user.click(screen.getByRole('button', { name: 'Send a new link' }));
    expect(apiService.post).toHaveBeenCalledWith('/auth/resend-verification', { email: 'ann@example.com' });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Too many requests'));
  });

  it('the cooldown counts down and frees the button again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(apiService.post).mockResolvedValue({ message: 'sent' });
    renderAt('/check-email', { email: 'ann@example.com' });

    await user.click(screen.getByRole('button', { name: 'Send a new link' }));
    expect(await screen.findByRole('button', { name: 'Send a new link (60s)' })).toBeDisabled();
    for (let i = 0; i < 60; i++) await act(async () => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('button', { name: 'Send a new link' })).toBeEnabled();
  });
});
