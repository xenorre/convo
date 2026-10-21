import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiService } from '@/services/apiService';
import type { Contact } from '@/types/auth';
import type { Message } from '@/types/message';
import type { AppSocket } from '@/types/socket';
import { notifyIncomingMessage } from '@/utils/messageNotifications';
import { useAuthStore } from '../useAuthStore';
import { useChatStore } from '../useChatStore';
import { useFriendsStore } from '../useFriendsStore';
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
    useChatStore.setState({ ...useChatStore.getInitialState(), activeTab: 'friends' }, true);
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
    useChatStore.setState({ activeTab: 'friends' });
  });

  it('opens a new sender from the event snapshot only when the notification is activated', () => {
    const receiveMessage = bindIncomingMessages();

    receiveMessage({ message, sender });

    expect(useChatStore.getState().selectedUser).toBeNull();
    expect(useChatStore.getState().activeTab).toBe('friends');
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

  it.each([
    ['chats', () => useChatStore.setState({ chats: [sender] })],
    ['friends', () => useFriendsStore.setState({ friends: [{ ...sender, since: '2026-10-01' }] })],
  ])(
    'opens a legacy message sender found in %s without a sender snapshot',
    (_, arrange) => {
      useFriendsStore.setState({ friends: [] });
      arrange();
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
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    useChatStore.setState({ selectedUser: sender, chats: [sender], isConversationVisible: true });
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
    useChatStore.setState({ messages: [message], chats: [sender], selectedUser: sender });
    const socket = useAuthStore.getState().socket!;

    advanceAuthSession();
    useChatStore.getState().resetChat();
    receiveMessage({ message: { ...message, _id: 'late-message' }, sender });
    notification.onOpen();

    expect(socket.off).toHaveBeenCalledWith('newMessage', expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(useChatStore.getState()).toMatchObject({
      messages: [], chats: [], unreadCounts: {},
      selectedUser: null, socketBound: false, boundSocket: null,
    });
    expect(notifyIncomingMessage).toHaveBeenCalledOnce();
  });

  it('clears private data synchronously on logout without waiting for a React effect', () => {
    bindIncomingMessages();
    const socket = useAuthStore.getState().socket!;
    useChatStore.setState({ messages: [message], chats: [sender], selectedUser: sender });

    useAuthStore.setState({ authUser: null, socket: null });

    expect(socket.off).toHaveBeenCalledWith('newMessage', expect.any(Function));
    expect(useChatStore.getState()).toMatchObject({
      messages: [], chats: [], selectedUser: null, boundSocket: null,
    });
  });

  it('clears private data before binding a replacement account socket', () => {
    useChatStore.setState({ messages: [message], chats: [sender], selectedUser: sender });
    const nextSocket = { on: vi.fn(), off: vi.fn() } as unknown as AppSocket;
    const currentUser = useAuthStore.getState().authUser!;

    useAuthStore.setState({ authUser: { ...currentUser, _id: 'another-account' }, socket: nextSocket });

    expect(useChatStore.getState()).toMatchObject({
      messages: [], chats: [], selectedUser: null, boundSocket: nextSocket,
    });
    expect(nextSocket.on).toHaveBeenCalledWith('newMessage', expect.any(Function));
  });

  it('discards private data returned by a request from the previous session', async () => {
    let completeRequest!: (value: unknown) => void;
    vi.mocked(apiService.get).mockImplementationOnce(() => new Promise(resolve => {
      completeRequest = resolve;
    }));
    const request = useChatStore.getState().getMyChatPartners();

    advanceAuthSession();
    useChatStore.getState().resetChat();
    completeRequest({ chats: [sender], unreadCounts: { [sender._id]: 1 } });
    await request;

    expect(useChatStore.getState().chats).toEqual([]);
    expect(useChatStore.getState().unreadCounts).toEqual({});
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
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    useChatStore.setState({ selectedUser: sender, chats: [sender], isConversationVisible: true });
    vi.mocked(apiService.get).mockImplementation(async url =>
      url === '/messages/chats' ? { chats: [sender], unreadCounts: {} } : { messages: [message] }
    );
    bindIncomingMessages();
    // The friends store listens for 'connect' on the same socket; take the
    // handler the chat store registered right after 'newMessage'.
    const calls = socketOn.mock.calls;
    const chatBinding = calls.findIndex(([event]) => event === 'newMessage');
    const reconnect = calls.slice(chatBinding).find(([event]) => event === 'connect')![1];

    // The store now binds before the initial connection completes.
    reconnect(undefined);
    reconnect(undefined);
    await Promise.resolve();
    await Promise.resolve();

    expect(apiService.get).toHaveBeenCalledWith('/messages/chats');
    expect(apiService.get).toHaveBeenCalledWith(`/messages/${sender._id}`);
    expect(useChatStore.getState().messages).toEqual([message]);
    expect(apiService.post).toHaveBeenCalledWith(`/messages/mark-read/${sender._id}`, {});
  });
});

describe('chat list order and last message', () => {
  const quiet: Contact = { _id: 'quiet-id', fullName: 'Bartek Nowak', profilePic: '' };
  const summary = (contact: Contact, createdAt: string, text = 'older') => ({
    ...contact,
    lastMessage: { _id: `${contact._id}-last`, senderId: contact._id, text, hasAttachment: false, createdAt },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiService.get).mockResolvedValue({ chats: [], unreadCounts: {} });
    vi.mocked(apiService.post).mockResolvedValue({});
    useChatStore.setState(useChatStore.getInitialState(), true);
    useAuthStore.setState({
      ...useAuthStore.getInitialState(),
      authUser: { _id: 'my-id', fullName: 'Current User', email: 'current@example.com', profilePic: '' },
      socket: { on: socketOn, off: vi.fn() } as unknown as AppSocket,
    }, true);
  });

  it('moves the sender to the top with the incoming message as preview', () => {
    useChatStore.setState({
      chats: [summary(quiet, '2026-10-19T11:30:00.000Z'), summary(sender, '2026-10-19T11:00:00.000Z')],
    });
    const receiveMessage = bindIncomingMessages();

    receiveMessage({ message: { ...message, image: 'https://cdn.test/f.pdf' }, sender });

    const [first, second] = useChatStore.getState().chats;
    expect(first._id).toBe(sender._id);
    expect(first.lastMessage).toEqual({
      _id: message._id,
      senderId: sender._id,
      text: message.text,
      hasAttachment: true,
      createdAt: message.createdAt,
    });
    expect(second._id).toBe(quiet._id);
    expect(apiService.get).not.toHaveBeenCalled();
  });

  it('adds a new sender from the snapshot with its message', () => {
    useChatStore.setState({ chats: [summary(quiet, '2026-10-19T10:00:00.000Z')] });
    const receiveMessage = bindIncomingMessages();

    receiveMessage({ message, sender });

    expect(useChatStore.getState().chats.map(chat => chat._id)).toEqual([sender._id, quiet._id]);
    expect(useChatStore.getState().chats[0]).toMatchObject({ fullName: sender.fullName });
  });

  it('keeps a newer preview when an older message arrives late', () => {
    const newer = summary(sender, '2026-10-19T12:30:00.000Z', 'newer');
    useChatStore.setState({ chats: [newer, summary(quiet, '2026-10-19T12:10:00.000Z')] });
    const receiveMessage = bindIncomingMessages();

    receiveMessage({ message, sender });

    expect(useChatStore.getState().chats[0]).toEqual(newer);
  });

  it('puts a sent message at the top, including a first message to a new contact', async () => {
    useChatStore.setState({ chats: [summary(quiet, '2026-10-19T10:00:00.000Z')], selectedUser: sender });
    const sent = {
      ...message,
      _id: 'sent-id',
      senderId: 'my-id',
      receiverId: sender._id,
      text: 'a'.repeat(200),
      createdAt: '2026-10-20T08:00:00.000Z',
    };
    vi.mocked(apiService.post).mockResolvedValueOnce({ message: sent });

    await useChatStore.getState().sendMessage({ text: sent.text });

    const [first] = useChatStore.getState().chats;
    expect(first).toMatchObject({ _id: sender._id, fullName: sender.fullName });
    expect(first.lastMessage).toMatchObject({ _id: 'sent-id', senderId: 'my-id', hasAttachment: false });
    expect(first.lastMessage?.text).toHaveLength(120);
    expect(useChatStore.getState().messages.map(msg => msg._id)).toEqual(['sent-id']);
  });

  it('does not touch the chat list when sending fails', async () => {
    const chats = [summary(quiet, '2026-10-19T10:00:00.000Z')];
    useChatStore.setState({ chats, selectedUser: sender });
    vi.mocked(apiService.post).mockRejectedValueOnce(new Error('offline'));

    await useChatStore.getState().sendMessage({ text: 'hello' });

    expect(useChatStore.getState().chats).toBe(chats);
  });

  it('stores the selected chat as a plain contact', () => {
    useChatStore.getState().setSelectedUser(summary(sender, '2026-10-19T10:00:00.000Z'));

    expect(useChatStore.getState().selectedUser).toEqual(sender);
  });
});

describe('reading the open conversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.mocked(apiService.get).mockResolvedValue({ chats: [], unreadCounts: {} });
    vi.mocked(apiService.post).mockResolvedValue({});
    useChatStore.setState({
      ...useChatStore.getInitialState(),
      selectedUser: sender,
      chats: [sender],
      isConversationVisible: true,
    }, true);
    useAuthStore.setState({
      ...useAuthStore.getInitialState(),
      authUser: { _id: 'my-id', fullName: 'Current User', email: 'current@example.com', profilePic: '' },
      socket: { on: socketOn, off: vi.fn() } as unknown as AppSocket,
    }, true);
  });

  it.each([
    ['the window has no focus', () => vi.spyOn(document, 'hasFocus').mockReturnValue(false)],
    ['the tab is hidden', () => {
      vi.spyOn(document, 'hasFocus').mockReturnValue(true);
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    }],
    ['Settings covers the conversation', () => {
      vi.spyOn(document, 'hasFocus').mockReturnValue(true);
      useChatStore.setState({ isConversationVisible: false });
    }],
  ])('counts and announces a message in the open chat when %s', async (_, arrange) => {
    arrange();
    const receiveMessage = bindIncomingMessages();

    receiveMessage({ message, sender });
    await Promise.resolve();

    expect(useChatStore.getState().messages).toEqual([message]);
    expect(apiService.post).not.toHaveBeenCalled();
    expect(useChatStore.getState().unreadCounts[sender._id]).toBe(1);
    expect(getNotification()).toMatchObject({ messageId: message._id, senderName: sender.fullName });
  });

  it('marks read only when the user is looking at that conversation', () => {
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const { isReadingConversation } = useChatStore.getState();

    expect(isReadingConversation(sender._id)).toBe(true);
    expect(isReadingConversation('someone-else')).toBe(false);
    hasFocus.mockReturnValue(false);
    expect(isReadingConversation(sender._id)).toBe(false);
  });
});
