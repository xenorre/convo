import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import toast from 'react-hot-toast';
import { apiService } from '@/services/apiService';
import { useAuthStore } from '@/store/useAuthStore';
import type { AppSocket } from '@/types/socket';
import AccountSettings from '../AccountSettings';

vi.mock('@/services/apiService', () => ({ apiService: { put: vi.fn(), post: vi.fn() } }));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
}));

const account = { _id: 'me', fullName: 'Ada', email: 'ada@example.com', profilePic: '' };
const reconnectSocket = vi.fn(async () => {});
const logout = vi.fn(async () => {});

const renderAccount = () => render(<MemoryRouter><AccountSettings /></MemoryRouter>);
const field = (name: string) => screen.getByLabelText(name);

async function fill(user: ReturnType<typeof userEvent.setup>, current: string, next: string, confirm = next) {
  if (current) await user.type(field('Current password'), current);
  if (next) await user.type(field('New password'), next);
  if (confirm) await user.type(field('Confirm new password'), confirm);
  await user.click(screen.getByRole('button', { name: 'Change password' }));
}

describe('Account settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ authUser: account, reconnectSocket, logout });
  });

  it('explains each problem next to its field without calling the server', async () => {
    const user = userEvent.setup();
    renderAccount();

    await fill(user, '', 'abc');
    expect(field('Current password')).toHaveAccessibleDescription('Enter your current password.');
    expect(field('New password')).toHaveAccessibleDescription('Use at least 6 characters.');

    await user.type(field('Current password'), 'old-password');
    await user.clear(field('New password'));
    await user.type(field('New password'), 'old-password');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(field('New password')).toHaveAccessibleDescription(/different from the current one/);

    await user.clear(field('New password'));
    await user.type(field('New password'), 'new-password');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(field('Confirm new password')).toHaveAccessibleDescription("Passwords don't match.");

    expect(apiService.put).not.toHaveBeenCalled();
  });

  it('changes the password, clears the form and reconnects on the new session', async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.put).mockResolvedValueOnce({ message: 'ok' });
    renderAccount();

    await fill(user, 'old-password', 'new-password');

    expect(apiService.put).toHaveBeenCalledExactlyOnceWith('/auth/password', {
      currentPassword: 'old-password',
      newPassword: 'new-password',
    });
    await waitFor(() => expect(reconnectSocket).toHaveBeenCalledOnce());
    expect(toast.success).toHaveBeenCalledWith('Password changed');
    expect(field('Current password')).toHaveValue('');
    expect(field('New password')).toHaveValue('');
    expect(field('Confirm new password')).toHaveValue('');
  });

  it('marks a wrong current password on its field and keeps the user signed in', async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.put).mockRejectedValueOnce({
      message: 'Current password is incorrect', status: 400, code: 'INVALID_CURRENT_PASSWORD',
    });
    renderAccount();

    await fill(user, 'guess', 'new-password');

    await waitFor(() => expect(field('Current password')).toHaveAccessibleDescription('Current password is incorrect.'));
    expect(field('Current password')).toHaveFocus();
    expect(field('New password')).toHaveValue('new-password');
    expect(toast.error).not.toHaveBeenCalled();
    expect(reconnectSocket).not.toHaveBeenCalled();
    expect(useAuthStore.getState().authUser).toEqual(account);
  });

  it('shows a general error for other failures', async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.put).mockRejectedValueOnce({ message: 'boom', status: 500 });
    renderAccount();

    await fill(user, 'old-password', 'new-password');

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't change your password. Try again later."));
    expect(screen.getByRole('button', { name: 'Change password' })).toBeEnabled();
  });

  it('logs out from the session card', async () => {
    const user = userEvent.setup();
    renderAccount();

    await user.click(screen.getByRole('button', { name: 'Log out' }));

    expect(logout).toHaveBeenCalledOnce();
  });

  it('gives password managers the account email', () => {
    const { container } = renderAccount();

    expect(container.querySelector('input[autocomplete="username"]')).toHaveValue(account.email);
  });
});

describe('reconnectSocket', () => {
  it('closes the current socket before opening a new one', async () => {
    const { reconnectSocket: realReconnect } = useAuthStore.getInitialState();
    const old = { off: vi.fn(), disconnect: vi.fn() } as unknown as AppSocket;
    const connectSocket = vi.fn(async () => {
      expect(old.disconnect).toHaveBeenCalled();
      expect(useAuthStore.getState().socket).toBeNull();
    });
    useAuthStore.setState({ authUser: account, socket: old, connectSocket, reconnectSocket: realReconnect });

    await useAuthStore.getState().reconnectSocket();

    expect(connectSocket).toHaveBeenCalledOnce();
  });
});
