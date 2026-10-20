import { describe, expect, it, vi } from 'vitest';
import type { AppSocket } from '@/types/socket';
import { useAuthStore } from '../useAuthStore';

const startup = vi.hoisted(() => {
  let releaseChatModule!: () => void;
  const chatModule = new Promise<void>(resolve => { releaseChatModule = resolve; });
  return {
    chatModule,
    releaseChatModule,
    socketModuleLoaded: false,
    io: vi.fn(),
    notifyIncomingMessage: vi.fn(),
  };
});

vi.mock('socket.io-client', () => {
  startup.socketModuleLoaded = true;
  return { io: startup.io };
});
vi.mock('@/services/apiService', () => ({ apiService: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/utils/messageNotifications', () => ({ notifyIncomingMessage: startup.notifyIncomingMessage }));
vi.mock('../useChatStore', async importOriginal => {
  await startup.chatModule;
  return importOriginal<typeof import('../useChatStore')>();
});

describe('authenticated chat startup', () => {
  it('waits for chat handlers, cancels the previous session and handles the first packet on connect', async () => {
    const nextUser = { _id: 'new-account', fullName: 'Test User', email: 'test@example.com', profilePic: '' };
    const sender = { _id: 'sender', fullName: 'Anna', profilePic: '' };
    const message = {
      _id: 'first-message', senderId: sender._id, receiverId: nextUser._id,
      text: 'First packet', createdAt: '2026-10-20T10:00:00Z', updatedAt: '2026-10-20T10:00:00Z',
    };
    const listeners = new Map<string, (data: unknown) => void>();
    const socket = {
      connected: false,
      on: vi.fn((event: string, handler: (data: unknown) => void) => listeners.set(event, handler)),
      off: vi.fn(),
      disconnect: vi.fn(),
      connect: vi.fn(() => listeners.get('newMessage')?.({ message, sender })),
    };
    startup.io.mockReturnValue(socket as unknown as AppSocket);

    useAuthStore.setState({ authUser: { ...nextUser, _id: 'old-account' } });
    const previousConnection = useAuthStore.getState().connectSocket();
    await vi.waitFor(() => expect(startup.socketModuleLoaded).toBe(true));
    expect(startup.io).not.toHaveBeenCalled();
    expect(socket.connect).not.toHaveBeenCalled();

    useAuthStore.getState().forceLogout();
    useAuthStore.setState({ authUser: nextUser });
    const nextConnection = useAuthStore.getState().connectSocket();
    expect(socket.connect).not.toHaveBeenCalled();

    startup.releaseChatModule();
    await Promise.all([previousConnection, nextConnection]);
    const { useChatStore } = await import('../useChatStore');

    expect(startup.io).toHaveBeenCalledOnce();
    expect(socket.connect).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().authUser).toEqual(nextUser);
    expect(useAuthStore.getState().socket).toBe(socket);
    expect(useChatStore.getState().unreadCounts).toEqual({ [sender._id]: 1 });
    expect(startup.notifyIncomingMessage).toHaveBeenCalledWith(expect.objectContaining({
      messageId: message._id, senderName: sender.fullName, preview: message.text,
    }));
  });
});
