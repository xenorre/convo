import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { apiService } from '@/services/apiService';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { useFriendsStore } from '@/store/useFriendsStore';
import ChatsLayout from '@/ChatsLayout';

vi.mock('@/services/apiService', () => ({
  apiService: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
}));

const last = (id: string, text: string) => ({ _id: `${id}-m`, senderId: id, text, hasAttachment: false, createdAt: new Date().toISOString() });
const ann = { _id: 'ann', fullName: 'Ann Lee', profilePic: '' };
const bob = { _id: 'bob', fullName: 'Bob Stone', profilePic: '' };
const cid = { _id: 'cid', fullName: 'Cid Moss', profilePic: '' };

describe('minimized and hidden chats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    Element.prototype.scrollTo = vi.fn();
    vi.mocked(apiService.get).mockImplementation(async (url: string) => {
      if (url === '/messages/chats') {
        return {
          chats: [
            { ...ann, lastMessage: last('ann', 'Hi from Ann') },
            { ...bob, lastMessage: last('bob', 'Hi from Bob'), hidden: true },
            { ...cid, lastMessage: last('cid', 'Hi from Cid'), hidden: true },
          ],
          unreadCounts: { cid: 2 },
          mutes: {},
        };
      }
      if (url.endsWith('/messaging')) return { canMessage: true };
      if (url === '/friends') return { friends: [] };
      if (url === '/friends/requests') return { incoming: [], outgoing: [] };
      if (url === '/users/blocked') return { users: [] };
      return { messages: [] };
    });
    vi.mocked(apiService.post).mockResolvedValue({});
    vi.mocked(apiService.put).mockResolvedValue({});
    useAuthStore.setState({ authUser: { _id: 'me', fullName: 'Me', email: 'me@example.com', profilePic: '' }, socket: null, onlineUsers: [] });
    useChatStore.setState(useChatStore.getInitialState(), true);
    useFriendsStore.setState({ ...useFriendsStore.getInitialState(), hasLoaded: true });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const renderLayout = async () => {
    render(<MemoryRouter><ChatsLayout /></MemoryRouter>);
    await act(async () => {});
  };

  it('keeps hidden chats in a collapsed section with their unread count', async () => {
    const user = userEvent.setup();
    await renderLayout();

    expect(screen.getByRole('button', { name: /Open chat with Ann Lee|Ann Lee/ })).toBeInTheDocument();
    expect(screen.queryByText('Hi from Bob')).toBeNull();
    const toggle = screen.getByRole('button', { name: /Hidden chats \(2\)/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('2 unread');

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Hi from Bob')).toBeInTheDocument();
  });

  it('search finds hidden chats too, marked as hidden', async () => {
    const user = userEvent.setup();
    await renderLayout();

    await user.type(screen.getByRole('searchbox', { name: 'Search chats' }), 'Bob');

    const row = screen.getByText('Hi from Bob').closest('button') as HTMLElement;
    expect(within(row).getByRole('img', { name: 'Hidden' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Hidden chats/ })).toBeNull();
  });

  it('hides the open chat from its menu, which closes it', async () => {
    const user = userEvent.setup();
    await renderLayout();
    await act(async () => useChatStore.getState().setSelectedUser(ann));

    await user.click(screen.getByRole('button', { name: 'More actions for Ann Lee' }));
    await user.click(screen.getByRole('button', { name: 'Hide chat' }));

    expect(apiService.put).toHaveBeenCalledWith('/messages/chats/ann/hide', {});
    expect(useChatStore.getState().selectedUser).toBeNull();
    expect(screen.getByRole('button', { name: /Hidden chats \(3\)/ })).toBeInTheDocument();
  });

  it('minimizes a conversation with its unsent text and brings both back', async () => {
    const user = userEvent.setup();
    await renderLayout();
    await act(async () => useChatStore.getState().setSelectedUser(ann));

    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Half-written');
    await user.click(screen.getByRole('button', { name: 'Minimize conversation' }));

    expect(useChatStore.getState().selectedUser).toBeNull();
    const dock = screen.getByRole('navigation', { name: 'Minimized chats' });
    await user.click(within(dock).getByRole('button', { name: 'Open chat with Ann Lee (draft)' }));

    expect(useChatStore.getState().selectedUser).toEqual(ann);
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Half-written');
    expect(screen.queryByRole('navigation', { name: 'Minimized chats' })).toBeNull();
  });

  it('keeps each conversation’s unsent text to itself', async () => {
    const user = userEvent.setup();
    await renderLayout();
    await act(async () => useChatStore.getState().setSelectedUser(ann));
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'For Ann');

    await act(async () => useChatStore.getState().setSelectedUser(bob));
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('');

    await act(async () => useChatStore.getState().setSelectedUser(ann));
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('For Ann');
  });

  it('closing a minimized chat removes it from the bar', async () => {
    const user = userEvent.setup();
    await renderLayout();
    await act(async () => useChatStore.setState({ minimizedChats: [ann, bob] }));

    await user.click(screen.getByRole('button', { name: 'Close minimized chat with Ann Lee' }));

    expect(useChatStore.getState().minimizedChats).toEqual([bob]);
  });
});
