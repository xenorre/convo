import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { apiService } from '@/services/apiService';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import ChatContainer from '../ChatContainer';

vi.mock('@/services/apiService', () => ({
  apiService: { get: vi.fn(), post: vi.fn() },
}));

const anna = { _id: 'anna-id', fullName: 'Anna', profilePic: '' };
const markReadCalls = () =>
  vi.mocked(apiService.post).mock.calls.filter(([url]) => url === `/messages/mark-read/${anna._id}`);

describe('ChatContainer read state', () => {
  let focused = true;

  beforeEach(() => {
    vi.clearAllMocks();
    focused = true;
    vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    Element.prototype.scrollTo = vi.fn();
    vi.mocked(apiService.get).mockResolvedValue({ messages: [] });
    vi.mocked(apiService.post).mockResolvedValue({});
    useAuthStore.setState({ authUser: { _id: 'me', fullName: 'Me', email: 'me@example.com', profilePic: '' }, socket: null, onlineUsers: [] });
    useChatStore.setState({ ...useChatStore.getInitialState(), selectedUser: anna, unreadCounts: { [anna._id]: 2 } });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('marks the conversation read once it is loaded and visible', async () => {
    render(<ChatContainer />);
    await screen.findByRole('heading', { name: 'Anna' });
    await act(async () => {});

    expect(useChatStore.getState().isConversationVisible).toBe(true);
    expect(markReadCalls()).toHaveLength(1);
  });

  it('waits for the user to come back to the window before marking read', async () => {
    focused = false;
    const { unmount } = render(<ChatContainer />);
    await act(async () => {});
    expect(markReadCalls()).toHaveLength(0);
    expect(useChatStore.getState().unreadCounts[anna._id]).toBe(2);

    focused = true;
    await act(async () => { window.dispatchEvent(new Event('focus')); });

    expect(markReadCalls()).toHaveLength(1);
    expect(useChatStore.getState().unreadCounts[anna._id]).toBe(0);

    unmount();
    expect(useChatStore.getState().isConversationVisible).toBe(false);
  });

  it('does not call the server on focus when nothing is unread', async () => {
    useChatStore.setState({ unreadCounts: {} });
    focused = false;
    render(<ChatContainer />);
    await act(async () => {});

    focused = true;
    await act(async () => { window.dispatchEvent(new Event('focus')); });

    expect(markReadCalls()).toHaveLength(0);
  });
});
