import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import toast from 'react-hot-toast';
import { apiService } from '@/services/apiService';
import { useAuthStore } from '@/store/useAuthStore';
import ConfirmEmailChange from '../ConfirmEmailChange';

vi.mock('@/services/apiService', () => ({ apiService: { get: vi.fn(), post: vi.fn() } }));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
}));

const ada = { _id: 'ada', fullName: 'Ada Lovelace', email: 'ada@example.com', profilePic: '' };

const renderAt = (path: string) => {
  const [pathname, search = ''] = path.split('?');
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[{ pathname, search: search && `?${search}` }]}>
        <Routes>
          <Route path="/confirm-email-change" element={<ConfirmEmailChange />} />
          <Route path="/settings/account" element={<p>Account settings</p>} />
          <Route path="/login" element={<p>Login page</p>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
};

describe('confirming a new email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ authUser: null });
  });

  it('signed in as the account: uses the link once, updates the email and returns to settings', async () => {
    useAuthStore.setState({ authUser: ada });
    vi.mocked(apiService.post).mockResolvedValue({ email: 'ada.new@example.com', userId: 'ada' });
    renderAt('/confirm-email-change?token=link-1');

    expect(await screen.findByText('Account settings')).toBeInTheDocument();
    expect(apiService.post).toHaveBeenCalledExactlyOnceWith('/auth/confirm-email-change', { token: 'link-1' });
    expect(useAuthStore.getState().authUser?.email).toBe('ada.new@example.com');
    expect(toast.success).toHaveBeenCalledWith('Email changed');
  });

  it('signed out (another device): says it worked and offers to log in', async () => {
    vi.mocked(apiService.post).mockResolvedValue({ email: 'ada.new@example.com', userId: 'ada' });
    renderAt('/confirm-email-change?token=link-2');

    expect(await screen.findByRole('heading', { name: 'Email changed' })).toBeInTheDocument();
    expect(screen.getByText('ada.new@example.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });

  it('explains a used or expired link, and an address taken in the meantime', async () => {
    vi.mocked(apiService.post).mockRejectedValueOnce({ status: 400, code: 'EMAIL_CHANGE_INVALID', message: 'x' });
    const { unmount } = renderAt('/confirm-email-change?token=link-3');
    expect(await screen.findByRole('heading', { name: "This link doesn't work" })).toBeInTheDocument();
    unmount();

    vi.mocked(apiService.post).mockRejectedValueOnce({ status: 409, code: 'EMAIL_CHANGE_EMAIL_TAKEN', message: 'x' });
    renderAt('/confirm-email-change?token=link-4');
    expect(await screen.findByRole('heading', { name: 'This email is taken' })).toBeInTheDocument();
  });

  it('can try again when only the request failed', async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.post).mockRejectedValueOnce({ status: 0, message: 'Network error' });
    renderAt('/confirm-email-change?token=link-5');

    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    vi.mocked(apiService.post).mockResolvedValueOnce({ email: 'ada.new@example.com', userId: 'ada' });

    expect(await screen.findByRole('heading', { name: 'Email changed' })).toBeInTheDocument();
  });

  it('treats a missing token as a broken link without calling the server', () => {
    renderAt('/confirm-email-change');
    expect(screen.getByRole('heading', { name: "This link doesn't work" })).toBeInTheDocument();
    expect(apiService.post).not.toHaveBeenCalled();
  });
});
