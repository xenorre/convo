import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiService } from '@/services/apiService';
import type { Contact } from '@/types/auth';
import type { Message } from '@/types/message';
import type { AppSocket } from '@/types/socket';
import { notifyIncomingMessage } from '@/utils/messageNotifications';
import { useAuthStore } from '../useAuthStore';
import { useChatStore } from '../useChatStore';
import { advanceAuthSession } from '@/services/authSession';

vi.mock('@/services/apiService', () => ({
  apiService: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('@/utils/messageNotifications', () => ({
  notifyIncomingMessage: vi.fn(),
}));

const sender: Contact = {
  _id: 'sender-id',
  fullName: 'Anna Kowalska',
  profilePic: '/anna.png',
};

const message: Message = {
  _id: 'message-id',
  senderId: sender._id,
  receiverId: 'my-id',
  text: 'Czy możemy porozmawiać?',
  createdAt: '2026-10-19T12:00:00.000Z',
  updatedAt: '2026-10-19T12:00:00.000Z',
};

const socketOn = vi.fn<(event: string, callback: (payload: unknown) => void) => void>();

function bindIncomingMessages() {
  useChatStore.getState().bindSocketOnce();
  const subscription = socketOn.mock.calls.find(([event]) => event === 'newMessage');
  expect(subscription).toBeDefined();
  return subscription![1];
}

function getNotification() {
  expect(notifyIncomingMessage).toHaveBeenCalledOnce();
  return vi.mocked(notifyIncomingMessage).mock.calls[0][0];
}

describe('incoming message notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiService.get).mockResolvedValue({ chats: [], unreadCounts: {} });
    vi.mocked(apiService.post).mockResolvedValue({});
    useChatStore.setState({ ...useChatStore.getInitialState(), activeTab: 'contacts' }, true);
    useAuthStore.setState({
      ...useAuthStore.getInitialState(),
      authUser: {
        _id: message.receiverId,
        fullName: 'Current User',
        email: 'current@example.com',
        profilePic: '/me.png',
      },
      socket: { on: socketOn, off: vi.fn() } as unknown as AppSocket,
    }, true);
  });

  it('opens a new sender from the event snapshot only when the notification is activated', () => {
    const receiveMessage = bindIncomingMessages();

    receiveMessage({ message, sender });

    expect(useChatStore.getState().selectedUser).toBeNull();
    expect(useChatStore.getState().activeTab).toBe('contacts');
    expect(useChatStore.getState().unreadCounts[sender._id]).toBe(1);
    const notification = getNotification();
    expect(notification).toMatchObject({
      messageId: message._id,
      senderName: sender.fullName,
      preview: message.text,
    });

    notification.onOpen();

    expect(useChatStore.getState().selectedUser).toEqual(sender);
    expect(useChatStore.getState().activeTab).toBe('chats');
    expect(apiService.get).not.toHaveBeenCalled();
    expect(apiService.post).not.toHaveBeenCalled();
  });

  it.each(['chats', 'allContacts'] as const)(
    'opens a legacy message sender found in %s without a sender snapshot',
    collection => {
      useChatStore.setState({ [collection]: [sender] });
      const receiveMessage = bindIncomingMessages();

      receiveMessage(message);
      const notification = getNotification();
      expect(notification.senderName).toBe(sender.fullName);

      notification.onOpen();

      expect(useChatStore.getState().selectedUser).toEqual(sender);
      expect(useChatStore.getState().activeTab).toBe('chats');
    },
  );

  it('uses contact details loaded after the notification appeared', async () => {
    const refreshedSender = { ...sender, fullName: 'Anna Nowak', profilePic: '/updated-anna.png' };
    vi.mocked(apiService.get).mockResolvedValueOnce({
      chats: [refreshedSender],
      unreadCounts: { [sender._id]: 1 },
    });
    const receiveMessage = bindIncomingMessages();

    receiveMessage(message);
    const notification = getNotification();
    expect(useChatStore.getState().selectedUser).toBeNull();

    await Promise.resolve();
    expect(useChatStore.getState().chats).toEqual([refreshedSender]);
    notification.onOpen();

    expect(useChatStore.getState().selectedUser).toEqual(refreshedSender);
    expect(useChatStore.getState().activeTab).toBe('chats');
  });

  it('can open a legacy sender by ID before contact details are available', () => {
    const receiveMessage = bindIncomingMessages();

    receiveMessage(message);
    getNotification().onOpen();

    expect(useChatStore.getState().selectedUser?._id).toBe(sender._id);
    expect(useChatStore.getState().activeTab).toBe('chats');
  });

  it('appends messages to an already open conversation without creating a notification', async () => {
    useChatStore.setState({ selectedUser: sender, chats: [sender] });
    const receiveMessage = bindIncomingMessages();

    receiveMessage({ message, sender });
    await Promise.resolve();

    expect(notifyIncomingMessage).not.toHaveBeenCalled();
    expect(useChatStore.getState().messages).toEqual([message]);
    expect(apiService.post).toHaveBeenCalledExactlyOnceWith(`/messages/mark-read/${sender._id}`, {});
    expect(useChatStore.getState().unreadCounts[sender._id]).toBe(0);
  });

  it('clears private data and detaches the old socket when the session ends', () => {
    const receiveMessage = bindIncomingMessages();
    receiveMessage({ message, sender });
    const notification = getNotification();
    useChatStore.setState({ messages: [message], allContacts: [sender], selectedUser: sender });
    const socket = useAuthStore.getState().socket!;

    advanceAuthSession();
    useChatStore.getState().resetChat();
    receiveMessage({ message: { ...message, _id: 'late-message' }, sender });
    notification.onOpen();

    expect(socket.off).toHaveBeenCalledWith('newMessage', expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(useChatStore.getState()).toMatchObject({
      messages: [], allContacts: [], chats: [], unreadCounts: {},
      selectedUser: null, socketBound: false, boundSocket: null,
    });
    expect(notifyIncomingMessage).toHaveBeenCalledOnce();
  });

  it('discards private data returned by a request from the previous session', async () => {
    let completeRequest!: (value: unknown) => void;
    vi.mocked(apiService.get).mockImplementationOnce(() => new Promise(resolve => {
      completeRequest = resolve;
    }));
    const request = useChatStore.getState().getAllContacts();

    advanceAuthSession();
    useChatStore.getState().resetChat();
    completeRequest({ users: [sender] });
    await request;

    expect(useChatStore.getState().allContacts).toEqual([]);
    expect(useChatStore.getState().isUsersLoading).toBe(false);
  });

  it('binds a new socket after signing in again', () => {
    const oldListener = bindIncomingMessages();
    const oldSocket = useAuthStore.getState().socket!;
    const nextOn = vi.fn();
    const nextSocket = { on: nextOn, off: vi.fn() } as unknown as AppSocket;
    useAuthStore.setState({ socket: nextSocket });

    useChatStore.getState().bindSocketOnce();
    oldListener({ message, sender });
    const nextListener = nextOn.mock.calls.find(([event]) => event === 'newMessage')![1];
    nextListener({ message, sender });

    expect(oldSocket.off).toHaveBeenCalledWith('newMessage', oldListener);
    expect(notifyIncomingMessage).toHaveBeenCalledOnce();
    expect(useChatStore.getState().boundSocket).toBe(nextSocket);
  });

  it('refreshes the chat history and unread counts after reconnecting', async () => {
    const socket = useAuthStore.getState().socket!;
    Object.assign(socket, { connected: true });
    useChatStore.setState({ selectedUser: sender, chats: [sender] });
    vi.mocked(apiService.get).mockImplementation(async url =>
      url === '/messages/chats' ? { chats: [sender], unreadCounts: {} } : { messages: [message] }
    );
    bindIncomingMessages();
    const reconnect = socketOn.mock.calls.find(([event]) => event === 'connect')![1];

    reconnect(undefined);
    await Promise.resolve();
    await Promise.resolve();

    expect(apiService.get).toHaveBeenCalledWith('/messages/chats');
    expect(apiService.get).toHaveBeenCalledWith(`/messages/${sender._id}`);
    expect(useChatStore.getState().messages).toEqual([message]);
    expect(apiService.post).toHaveBeenCalledWith(`/messages/mark-read/${sender._id}`, {});
  });
});
