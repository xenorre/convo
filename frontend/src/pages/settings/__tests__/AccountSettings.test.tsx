import { beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import toast from 'react-hot-toast';
import { apiService } from '@/services/apiService';
import { useAuthStore } from '@/store/useAuthStore';
import type { AppSocket } from '@/types/socket';
import AccountSettings from '../AccountSettings';
import { loadStrengthChecker } from '@/utils/passwordPolicy';

vi.mock('@/services/apiService', () => ({ apiService: { put: vi.fn(), post: vi.fn(), get: vi.fn(), delete: vi.fn() } }));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
}));

const account = { _id: 'me', fullName: 'Ada Lovelace', email: 'ada@example.com', profilePic: '' };
// Passes every local rule (12+ characters, no name or email, zxcvbn score 3+).
const STRONG = 'violet-anchor-harbor-71';
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
  // The dictionaries are large; loading them once up front keeps a cold
  // first load from racing the assertions.
  // Awaited, not returned: a function returned from beforeAll runs as teardown.
  beforeAll(async () => {
    await loadStrengthChecker();
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiService.get).mockResolvedValue({ email: account.email, pending: null });
    useAuthStore.setState({ authUser: account, reconnectSocket, logout });
  });

  it('explains each problem next to its field without calling the server', async () => {
    const user = userEvent.setup();
    renderAccount();

    await fill(user, '', 'abc');
    expect(field('Current password')).toHaveAccessibleDescription('Enter your current password.');
    expect(field('New password')).toHaveAccessibleDescription(/^Use at least 12 characters/);

    await user.clear(field('New password'));
    await user.type(field('New password'), 'lovelace-forever-2026');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(field('New password')).toHaveAccessibleDescription(/^Don't use your name or email/);

    await user.clear(field('New password'));
    await user.type(field('New password'), 'password1234');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(field('New password')).toHaveAccessibleDescription(/^This password is too easy to guess/);

    await user.type(field('Current password'), 'old-password');
    await user.clear(field('New password'));
    await user.type(field('New password'), 'old-password');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(field('New password')).toHaveAccessibleDescription(/^Choose a password different from the current one/);

    await user.clear(field('New password'));
    await user.type(field('New password'), STRONG);
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(field('Confirm new password')).toHaveAccessibleDescription("Passwords don't match.");

    expect(apiService.put).not.toHaveBeenCalled();
  });

  it('changes the password, clears the form and reconnects on the new session', async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.put).mockResolvedValueOnce({ message: 'ok' });
    renderAccount();

    await fill(user, 'old-password', STRONG);

    expect(apiService.put).toHaveBeenCalledExactlyOnceWith('/auth/password', {
      currentPassword: 'old-password',
      newPassword: STRONG,
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

    await fill(user, 'guess', STRONG);

    await waitFor(() => expect(field('Current password')).toHaveAccessibleDescription('Current password is incorrect.'));
    expect(field('Current password')).toHaveFocus();
    expect(field('New password')).toHaveValue(STRONG);
    expect(toast.error).not.toHaveBeenCalled();
    expect(reconnectSocket).not.toHaveBeenCalled();
    expect(useAuthStore.getState().authUser).toEqual(account);
  });

  it('shows a general error for other failures', async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.put).mockRejectedValueOnce({ message: 'boom', status: 500 });
    renderAccount();

    await fill(user, 'old-password', STRONG);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't change your password. Try again later."));
    expect(screen.getByRole('button', { name: 'Change password' })).toBeEnabled();
  });

  it('shows a password the server refuses, such as a breached one, on its field', async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.put).mockRejectedValueOnce({
      message: 'This password has appeared in a data breach, so attackers try it first. Choose a different one',
      status: 400,
      code: 'PASSWORD_BREACHED',
    });
    renderAccount();

    await fill(user, 'old-password', STRONG);

    await waitFor(() => expect(field('New password')).toHaveAccessibleDescription(/^This password has appeared in a data breach/));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('measures the new password while it is typed', async () => {
    const user = userEvent.setup();
    renderAccount();

    await user.type(field('New password'), 'password1234');
    expect(await screen.findByText(/^(Very weak|Weak)$/)).toBeInTheDocument();
    expect(screen.getByText('At least 12 characters').closest('li')).toHaveTextContent('Done:');
    expect(screen.getByText('Hard to guess (Good or Strong)').closest('li')).toHaveTextContent('Not yet:');

    await user.clear(field('New password'));
    await user.type(field('New password'), STRONG);
    await waitFor(() => expect(screen.getByText('Hard to guess (Good or Strong)').closest('li')).toHaveTextContent('Done:'));
  });

  it('lets each password field be shown on its own', async () => {
    const user = userEvent.setup();
    renderAccount();

    await user.click(screen.getByRole('button', { name: 'Show new password' }));

    expect(field('New password')).toHaveAttribute('type', 'text');
    expect(field('Current password')).toHaveAttribute('type', 'password');
    expect(field('Confirm new password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Hide new password' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Show current password' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show confirm new password' })).toBeInTheDocument();
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

describe('changing the email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiService.get).mockResolvedValue({ email: account.email, pending: null });
    useAuthStore.setState({ authUser: account });
  });

  const requestChange = async (user: ReturnType<typeof userEvent.setup>, newEmail: string, password: string) => {
    if (newEmail) await user.type(screen.getByLabelText('New email'), newEmail);
    if (password) await user.type(screen.getByLabelText('Password'), password);
    await user.click(screen.getByRole('button', { name: /Send (confirmation|a new) link/ }));
  };

  it('sends a link to the new address and shows the change waiting for it', async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.post).mockResolvedValue({
      pending: { email: 'ada.new@example.com', expiresAt: '2026-10-26T10:00:00.000Z' },
    });
    renderAccount();

    await requestChange(user, ' Ada.New@Example.com ', 'my-password');

    expect(apiService.post).toHaveBeenCalledWith('/users/me/email', { newEmail: 'ada.new@example.com', password: 'my-password' });
    expect(await screen.findByText(/Waiting for you to confirm/)).toHaveTextContent('ada.new@example.com');
    expect(screen.getByLabelText('New email')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Send a new link' })).toBeInTheDocument();
  });

  it('checks the address and the password before asking the server', async () => {
    const user = userEvent.setup();
    renderAccount();

    await requestChange(user, 'ada@example.com', '');

    expect(screen.getByLabelText('New email')).toHaveAccessibleDescription("That's already your email.");
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Enter your password.');
    expect(apiService.post).not.toHaveBeenCalled();
  });

  it("shows the server's refusal on the field it is about", async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.post)
      .mockRejectedValueOnce({ status: 400, code: 'EMAIL_CHANGE_INVALID_PASSWORD', message: 'Password is incorrect' })
      .mockRejectedValueOnce({ status: 409, code: 'EMAIL_CHANGE_EMAIL_TAKEN', message: 'Another account already uses this email' });
    renderAccount();

    await requestChange(user, 'bob@example.com', 'guess');
    expect(await screen.findByText('Password is incorrect.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Send confirmation link' }));
    expect(await screen.findByText('Another account already uses this email.')).toBeInTheDocument();
    expect(screen.getByLabelText('New email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a change already waiting and can cancel it', async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.get).mockResolvedValue({
      email: account.email,
      pending: { email: 'ada.new@example.com', expiresAt: '2026-10-26T10:00:00.000Z' },
    });
    vi.mocked(apiService.delete).mockResolvedValue({ pending: null });
    renderAccount();

    await user.click(await screen.findByRole('button', { name: 'Cancel change' }));

    expect(apiService.delete).toHaveBeenCalledWith('/users/me/email/pending');
    await waitFor(() => expect(screen.queryByText(/Waiting for you to confirm/)).toBeNull());
  });
});

describe('your data and deleting the account', () => {
  const deleteAccount = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiService.get).mockResolvedValue({ email: account.email, pending: null });
    useAuthStore.setState({ authUser: account, deleteAccount });
  });

  const renderWithLogin = () =>
    render(
      <MemoryRouter initialEntries={['/settings/account']}>
        <Routes>
          <Route path="/settings/account" element={<AccountSettings />} />
          <Route path="/login" element={<p>Login page</p>} />
        </Routes>
      </MemoryRouter>,
    );

  const askToDelete = async (user: ReturnType<typeof userEvent.setup>, password: string) => {
    if (password) await user.type(screen.getByLabelText('Your password'), password);
    await user.click(screen.getByRole('button', { name: 'Delete account' }));
  };

  it('downloads a copy of the account as a JSON file', async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.get).mockResolvedValue({ format: 'convo-account-export' });
    const fileParts: BlobPart[] = [];
    vi.stubGlobal('Blob', class {
      constructor(parts: BlobPart[]) {
        fileParts.push(...parts);
      }
    });
    const createObjectURL = vi.fn(() => 'blob:export');
    // jsdom has no object URLs; these stand in for this test only.
    const { createObjectURL: realCreate, revokeObjectURL: realRevoke } = URL;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    onTestFinished(() => {
      URL.createObjectURL = realCreate;
      URL.revokeObjectURL = realRevoke;
    });
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });
    renderWithLogin();

    await user.click(screen.getByRole('button', { name: 'Download my data' }));

    await waitFor(() => expect(saved).toEqual([expect.stringMatching(/^convo-data-\d{4}-\d{2}-\d{2}\.json$/)]));
    expect(apiService.get).toHaveBeenCalledWith('/users/me/export');
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(JSON.parse(String(fileParts[0]))).toEqual({ format: 'convo-account-export' });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('asks for the password before anything else', async () => {
    const user = userEvent.setup();
    renderWithLogin();

    await askToDelete(user, '');

    expect(screen.getByLabelText('Your password')).toHaveAccessibleDescription('Enter your password to continue.');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('says what goes, then deletes and opens the login page', async () => {
    const user = userEvent.setup();
    deleteAccount.mockResolvedValue({ kind: 'deleted' });
    renderWithLogin();

    await askToDelete(user, 'my-password');
    const dialog = screen.getByRole('alertdialog', { name: 'Delete your account?' });
    expect(dialog).toHaveTextContent('Deleted account');
    // Armed after a moment, so a double click can't answer it.
    const confirm = screen.getByRole('button', { name: 'Delete forever' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(deleteAccount).toHaveBeenCalledExactlyOnceWith('my-password');
  });

  it('a wrong password closes the dialog and is shown on the field', async () => {
    const user = userEvent.setup();
    deleteAccount.mockResolvedValue({ kind: 'wrong-password' });
    renderWithLogin();

    await askToDelete(user, 'guess');
    const confirm = screen.getByRole('button', { name: 'Delete forever' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByLabelText('Your password')).toHaveAccessibleDescription('Password is incorrect.');
    expect(screen.queryByText('Login page')).toBeNull();
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
