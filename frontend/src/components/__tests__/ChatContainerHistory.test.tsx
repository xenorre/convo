import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { apiService } from '@/services/apiService';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { useFriendsStore } from '@/store/useFriendsStore';
import type { Message } from '@/types/message';
import ChatContainer from '@/components/ChatContainer';

vi.mock('@/services/apiService', () => ({
  apiService: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
}));

const bob = { _id: 'bob', fullName: 'Bob Jones', profilePic: '' };
const msg = (n: number, senderId = 'bob'): Message => ({
  _id: `m${String(n).padStart(3, '0')}`,
  senderId,
  receiverId: senderId === 'bob' ? 'me' : 'bob',
  text: `Message #${n}`,
  createdAt: new Date(Date.UTC(2026, 9, 20, 10, n)).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 9, 20, 10, n)).toISOString(),
});
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => msg(from + i));

// jsdom has no layout: the observer is driven by hand and the list gets a size.
let observed: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];
class FakeIntersectionObserver {
  private callback: (entries: Array<{ isIntersecting: boolean }>) => void;
  constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
    this.callback = callback;
  }
  observe() { observed.push(this.callback); }
  disconnect() { observed = observed.filter((callback) => callback !== this.callback); }
  unobserve() {}
}
const topComesNear = () => act(() => observed.at(-1)?.([{ isIntersecting: true }]));

const sizeList = (scrollTop: number) => {
  const list = document.querySelector('[data-message-list]') as HTMLElement;
  Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 5000 });
  Object.defineProperty(list, 'clientHeight', { configurable: true, value: 500 });
  list.scrollTop = scrollTop;
  fireEvent.scroll(list);
  return list;
};

describe('conversation history', () => {
  beforeEach(() => {
    observed = [];
    vi.clearAllMocks();
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    Element.prototype.scrollTo = vi.fn();
    vi.mocked(apiService.post).mockResolvedValue({});
    useAuthStore.setState({ authUser: { _id: 'me', fullName: 'Me', email: 'me@example.com', profilePic: '' }, socket: null, onlineUsers: [] });
    useChatStore.setState({ ...useChatStore.getInitialState(), selectedUser: bob });
    useFriendsStore.setState({ ...useFriendsStore.getInitialState(), hasLoaded: true });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const open = async (pages: Array<{ messages: Message[]; hasMore: boolean; nextCursor: string | null }>) => {
    vi.mocked(apiService.get).mockImplementation(async (url, config) => {
      if (url === '/users/bob/messaging') return { canMessage: true };
      const before = (config as { params?: { before?: string } } | undefined)?.params?.before;
      return before === 'c71' ? pages[1] : pages[0];
    });
    render(<ChatContainer />);
    await screen.findByText('Message #100');
  };

  it('loads the older page when the top of the list comes near, then says where the conversation starts', async () => {
    await open([
      { messages: range(71, 100), hasMore: true, nextCursor: 'c71' },
      { messages: range(1, 70), hasMore: false, nextCursor: null },
    ]);
    expect(screen.queryByText(/This is the start of your conversation/)).toBeNull();

    await topComesNear();

    expect(await screen.findByText('Message #1')).toBeInTheDocument();
    expect(screen.getByText('This is the start of your conversation with Bob Jones.')).toBeInTheDocument();
    expect(apiService.get).toHaveBeenCalledWith('/messages/bob', { params: { before: 'c71' } });
    // Nothing older is left, so nothing watches the top any more.
    expect(observed).toEqual([]);
  });

  it('offers a way back down when reading far up, and points out messages that arrive meanwhile', async () => {
    await open([{ messages: range(71, 100), hasMore: false, nextCursor: null }]);

    sizeList(0);
    expect(screen.getByRole('button', { name: 'Jump to latest' })).toBeInTheDocument();

    act(() => useChatStore.setState((state) => ({ messages: [...state.messages, msg(101)] })));
    expect(screen.getByRole('button', { name: 'New messages' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New messages' }));
    expect(Element.prototype.scrollTo).toHaveBeenCalled();
    // Back at the bottom, the button goes away.
    sizeList(4500);
    expect(screen.queryByRole('button', { name: /New messages|Jump to latest/ })).toBeNull();
  });

  it('follows my own new message even when reading further up', async () => {
    await open([{ messages: range(71, 100), hasMore: false, nextCursor: null }]);
    sizeList(0);
    vi.mocked(Element.prototype.scrollTo).mockClear();

    act(() => useChatStore.setState((state) => ({ messages: [...state.messages, msg(101, 'me')] })));

    expect(Element.prototype.scrollTo).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'New messages' })).toBeNull();
  });
});
