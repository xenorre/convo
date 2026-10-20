import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import toast from 'react-hot-toast';
import App from '@/App';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { notifyIncomingMessage } from '../messageNotifications';

vi.mock('react-hot-toast', async importOriginal =>
  importOriginal<typeof import('react-hot-toast')>()
);

vi.mock('@/pages/ChatPage', () => ({
  default: function MockChatPage() {
    const selectedUser = useChatStore(state => state.selectedUser);
    return <p>{selectedUser ? `Chat with ${selectedUser.fullName}` : 'Choose a chat'}</p>;
  },
}));

const sender = { _id: 'sender-1', fullName: 'Anna', profilePic: '/anna.png' };
const account = { _id: 'me', fullName: 'Me', email: 'me@example.com', profilePic: '' };
const checkAuth = useAuthStore.getState().checkAuth;

describe('incoming message notification', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })));
    useAuthStore.setState({
      authUser: account,
      isCheckingAuth: false,
      socket: null,
      checkAuth: vi.fn(async () => {}),
    });
    useChatStore.setState({ selectedUser: null, activeTab: 'contacts' });
    act(() => toast.remove());
  });

  afterEach(() => {
    cleanup();
    act(() => toast.remove());
    useAuthStore.setState({ authUser: null, checkAuth });
    vi.unstubAllGlobals();
  });

  const showNotification = async () => {
    const onOpen = vi.fn(() => {
      useChatStore.setState({ selectedUser: sender, activeTab: 'chats' });
    });
    render(<MemoryRouter initialEntries={['/settings']}><App /></MemoryRouter>);
    await act(async () => {
      notifyIncomingMessage({
        messageId: 'message-1',
        senderName: sender.fullName,
        preview: 'Hi there!',
        onOpen,
      });
    });
    return onOpen;
  };

  it.each(['click', 'Enter', 'Space'])('opens the sender chat using %s from another page', async method => {
    const user = userEvent.setup();
    const onOpen = await showNotification();
    const action = screen.getByRole('button', { name: /Open chat with Anna/ });

    if (method === 'click') {
      await user.click(action);
    } else {
      action.focus();
      await user.keyboard(method === 'Enter' ? '{Enter}' : ' ');
    }

    expect(onOpen).toHaveBeenCalledOnce();
    expect(await screen.findByText('Chat with Anna')).toBeInTheDocument();
    expect(useChatStore.getState().activeTab).toBe('chats');
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Open chat with Anna/ })).not.toBeInTheDocument();
    });
  });

  it('dismisses with the close button without opening a conversation', async () => {
    const user = userEvent.setup();
    const onOpen = await showNotification();

    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Open chat with Anna/ })).not.toBeInTheDocument();
    });

    expect(onOpen).not.toHaveBeenCalled();
    expect(useChatStore.getState().selectedUser).toBeNull();
    expect(screen.getByText('Settings Page')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open chat with Anna/ })).not.toBeInTheDocument();
  });

  it('still clears the selected conversation when the account changes', async () => {
    const user = userEvent.setup();
    await showNotification();
    await user.click(screen.getByRole('button', { name: /Open chat with Anna/ }));
    expect(screen.getByText('Chat with Anna')).toBeInTheDocument();

    await act(async () => {
      useAuthStore.setState({ authUser: { ...account, _id: 'another-account' } });
    });

    expect(screen.getByText('Choose a chat')).toBeInTheDocument();
    expect(useChatStore.getState().selectedUser).toBeNull();
  });
});
