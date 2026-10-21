import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiService } from '@/services/apiService';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { useFriendsStore } from '@/store/useFriendsStore';
import ChatContainer from '@/components/ChatContainer';

vi.mock('@/services/apiService', () => ({
  apiService: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
}));

const stranger = { _id: 'sam', fullName: 'Sam Stranger', profilePic: '' };

describe('Conversation menu and blocked conversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    Element.prototype.scrollTo = vi.fn();
    vi.mocked(apiService.get).mockResolvedValue({ messages: [] });
    vi.mocked(apiService.post).mockResolvedValue({});
    useAuthStore.setState({ authUser: { _id: 'me', fullName: 'Me', email: 'me@example.com', profilePic: '' }, socket: null, onlineUsers: [] });
    useChatStore.setState({ ...useChatStore.getInitialState(), selectedUser: stranger });
    useFriendsStore.setState({ ...useFriendsStore.getInitialState(), hasLoaded: true });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
    render(<ChatContainer />);
    await act(async () => {});
    await user.click(screen.getByRole('button', { name: 'More actions for Sam Stranger' }));
  };

  it('offers to add someone who is not a friend yet', async () => {
    const user = userEvent.setup();
    // Opening the chat also posts mark-read, so answer by URL.
    vi.mocked(apiService.post).mockImplementation(async (url) =>
      url === '/friends/requests'
        ? { status: 'requested', request: { friendRequestId: 'r1', user: stranger, createdAt: 'now' } }
        : {});
    await openMenu(user);

    await user.click(screen.getByRole('button', { name: 'Add friend' }));

    expect(apiService.post).toHaveBeenCalledWith('/friends/requests', { userId: 'sam' });
    await user.click(screen.getByRole('button', { name: 'More actions for Sam Stranger' }));
    expect(screen.getByText('Friend request sent')).toBeInTheDocument();
  });

  it('blocks after confirming and swaps the message box for an unblock notice', async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.post).mockImplementation(async (url) =>
      url === '/users/sam/block' ? { status: 'blocked', endedFriendRequestId: null } : {});
    vi.mocked(apiService.delete).mockResolvedValue({});
    await openMenu(user);
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Block' }));
    await user.click(screen.getByRole('button', { name: 'Block Sam' }));

    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
    expect(screen.getByText('You blocked Sam Stranger. Unblock them to send messages.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Unblock' }));
    expect(apiService.delete).toHaveBeenCalledWith('/users/sam/block');
    expect(await screen.findByRole('textbox', { name: 'Message' })).toBeInTheDocument();
  });

  it('closes on Escape without closing the conversation', async () => {
    const user = userEvent.setup();
    await openMenu(user);
    expect(screen.getByRole('button', { name: 'Block' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('button', { name: 'Block' })).toBeNull();
    expect(useChatStore.getState().selectedUser).toEqual(stranger);
  });
});
