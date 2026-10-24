import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import toast from 'react-hot-toast';
import { apiService } from '@/services/apiService';
import { useFriendsStore } from '@/store/useFriendsStore';
import PrivacySettings from '../PrivacySettings';

vi.mock('@/services/apiService', () => ({
  apiService: { get: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
}));

const defaults = { allowMessagesFrom: 'friends', allowFriendRequestsFrom: 'everyone', showOnlineStatus: true, readReceipts: true };
const renderPrivacy = () => render(<MemoryRouter><PrivacySettings /></MemoryRouter>);

describe('Privacy settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiService.get).mockResolvedValue({ privacy: defaults });
    useFriendsStore.setState({
      ...useFriendsStore.getInitialState(),
      hasLoaded: true,
      blocked: [{ _id: 'sam', fullName: 'Sam Stranger', profilePic: '', blockedAt: 'now' }],
    });
  });

  it('shows the saved settings and saves each change right away', async () => {
    const user = userEvent.setup();
    // Like the server, each answer carries every change saved so far.
    let saved = { ...defaults };
    vi.mocked(apiService.patch).mockImplementation(async (_, body) => {
      saved = { ...saved, ...(body as { privacy: object }).privacy };
      return { privacy: saved };
    });
    renderPrivacy();

    const friendsOnly = await screen.findByRole('radio', { name: 'Friends only' });
    expect(friendsOnly).toBeChecked();

    await user.click(screen.getAllByRole('radio', { name: 'Everyone' })[0]);
    await user.click(screen.getByRole('radio', { name: 'Nobody' }));
    await user.click(screen.getByRole('switch', { name: "Show when I'm online" }));
    await user.click(screen.getByRole('switch', { name: "Show when I've read messages" }));

    expect(vi.mocked(apiService.patch).mock.calls.map(([url, body]) => [url, body])).toEqual([
      ['/users/settings', { privacy: { allowMessagesFrom: 'everyone' } }],
      ['/users/settings', { privacy: { allowFriendRequestsFrom: 'nobody' } }],
      ['/users/settings', { privacy: { showOnlineStatus: false } }],
      ['/users/settings', { privacy: { readReceipts: false } }],
    ]);
    expect(screen.getByRole('switch', { name: "Show when I'm online" })).toHaveAttribute('aria-checked', 'false');
  });

  it('puts the old value back when saving fails', async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.patch).mockRejectedValueOnce({ status: 500, message: 'down' });
    renderPrivacy();

    await user.click(await screen.findByRole('radio', { name: 'Nobody' }));

    await waitFor(() => expect(screen.getAllByRole('radio', { name: 'Everyone' })[1]).toBeChecked());
    expect(toast.error).toHaveBeenCalledWith("Couldn't save that change. Try again later.");
  });

  it('lists blocked people with an unblock button', async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.delete).mockResolvedValueOnce({});
    renderPrivacy();

    await user.click(await screen.findByRole('button', { name: 'Unblock Sam Stranger' }));

    expect(apiService.delete).toHaveBeenCalledWith('/users/sam/block');
    expect(await screen.findByText("You haven't blocked anyone.")).toBeInTheDocument();
  });
});
