import { beforeEach, describe, expect, it, vi } from 'vitest';
import toast from 'react-hot-toast';
import { apiService } from '@/services/apiService';
import { useAuthStore } from '../useAuthStore';
import { io } from 'socket.io-client';
import type { AuthUser } from '@/types/auth';
import {
  advanceAuthSession,
  getAuthSessionVersion,
  reportAuthenticationFailure,
  SESSION_REVOKED_MESSAGE,
} from '@/services/authSession';

vi.mock('@/services/apiService', () => ({
  apiService: { get: vi.fn(), post: vi.fn() },
}));

const user: AuthUser = {
  _id: 'user-1',
  fullName: 'Test User',
  email: 'test@example.com',
  profilePic: '',
};

const createSocket = () => {
  const listeners = new Map<string, (data: unknown) => void>();
  return {
    listeners,
    connected: false,
    on: vi.fn((event: string, callback: (data: unknown) => void) => listeners.set(event, callback)),
    off: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
};

beforeEach(() => {
  advanceAuthSession();
  useAuthStore.getState().disconnectSocket();
  vi.clearAllMocks();
  useAuthStore.setState({
    authUser: null,
    isCheckingAuth: true,
    isLoggingIn: false,
    isSigningUp: false,
    socket: null,
    onlineUsers: [],
  });
  vi.mocked(io).mockImplementation(() => createSocket() as unknown as ReturnType<typeof io>);
});

vi.mock('@/services/logger', () => ({
  logger: { error: vi.fn() },
}));

describe('session check', () => {

  it.each([401, 403])('opens the login screen silently for HTTP %s', async status => {
    vi.mocked(apiService.get).mockRejectedValueOnce({
      status,
      message: 'Unauthorized',
    });

    await useAuthStore.getState().checkAuth();

    expect(useAuthStore.getState().authUser).toBeNull();
    expect(useAuthStore.getState().isCheckingAuth).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('still reports a genuine server failure', async () => {
    vi.mocked(apiService.get).mockRejectedValueOnce({
      status: 500,
      message: 'Internal server error',
    });

    await useAuthStore.getState().checkAuth();

    expect(useAuthStore.getState().isCheckingAuth).toBe(false);
    expect(toast.error).toHaveBeenCalledExactlyOnceWith('Server error. Please try again later.');
  });
});

describe('session termination', () => {
  const connectUser = async () => {
    const socket = createSocket();
    vi.mocked(io).mockReturnValueOnce(socket as unknown as ReturnType<typeof io>);
    useAuthStore.setState({ authUser: user, onlineUsers: [user._id] });
    await useAuthStore.getState().connectSocket();
    return socket;
  };

  it('immediately clears a revoked session and displays one notification without logging out on the server', async () => {
    const socket = await connectUser();
    const revoke = socket.listeners.get('session:revoked');
    revoke?.({ code: 'SESSION_REVOKED', message: SESSION_REVOKED_MESSAGE });
    revoke?.({ code: 'SESSION_REVOKED', message: SESSION_REVOKED_MESSAGE });

    expect(useAuthStore.getState()).toMatchObject({ authUser: null, socket: null, onlineUsers: [] });
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(apiService.post).not.toHaveBeenCalled();
    expect(toast.dismiss).toHaveBeenCalledOnce();
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(SESSION_REVOKED_MESSAGE, {
      id: 'session-ended', duration: 7000,
    });
  });

  it.each(['SESSION_REVOKED', 'UNAUTHORIZED'])('handles an authentication handshake error with code %s', async code => {
    const socket = await connectUser();
    socket.listeners.get('connect_error')?.({ data: { code, message: 'Please sign in again.' } });

    expect(useAuthStore.getState().authUser).toBeNull();
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(toast.error).toHaveBeenCalledOnce();
  });

  it('preserves authentication during a temporary connection failure', async () => {
    const socket = await connectUser();
    socket.listeners.get('connect_error')?.(new Error('Connection timeout'));

    expect(useAuthStore.getState().authUser).toEqual(user);
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('ignores old socket revocation and presence events after a fresh login', async () => {
    const previousSocket = await connectUser();
    const newUser = { ...user, _id: 'user-2' };
    vi.mocked(apiService.post).mockResolvedValueOnce({ user: newUser });
    await useAuthStore.getState().login({ email: newUser.email, password: 'password' });
    await useAuthStore.getState().connectSocket();
    const newSocket = useAuthStore.getState().socket;

    previousSocket.listeners.get('session:revoked')?.({ message: SESSION_REVOKED_MESSAGE });
    previousSocket.listeners.get('getOnlineUsers')?.(['stale-user']);

    expect(useAuthStore.getState().authUser).toEqual(newUser);
    expect(useAuthStore.getState().socket).toBe(newSocket);
    expect(useAuthStore.getState().onlineUsers).toEqual([]);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('disconnects a socket even while it is still connecting and allows a new connection', async () => {
    const socket = await connectUser();
    useAuthStore.getState().disconnectSocket();
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().socket).toBeNull();

    await useAuthStore.getState().connectSocket();
    expect(useAuthStore.getState().socket).not.toBeNull();
    expect(useAuthStore.getState().socket).not.toBe(socket);
  });

  it('does not create duplicate sockets while connecting', async () => {
    useAuthStore.setState({ authUser: user });
    await Promise.all([
      useAuthStore.getState().connectSocket(),
      useAuthStore.getState().connectSocket(),
    ]);
    expect(io).toHaveBeenCalledOnce();
  });

  it('does not create a socket when logout invalidates a pending module import', async () => {
    useAuthStore.setState({ authUser: user });
    const connecting = useAuthStore.getState().connectSocket();
    useAuthStore.getState().forceLogout(SESSION_REVOKED_MESSAGE);
    await connecting;

    expect(io).not.toHaveBeenCalled();
    expect(useAuthStore.getState().socket).toBeNull();
  });

  it('allows a new connection while an earlier session is still loading the socket module', async () => {
    useAuthStore.setState({ authUser: user });
    const previousConnection = useAuthStore.getState().connectSocket();
    advanceAuthSession();
    useAuthStore.getState().disconnectSocket();
    const nextUser = { ...user, _id: 'new-user' };
    useAuthStore.setState({ authUser: nextUser });
    const nextConnection = useAuthStore.getState().connectSocket();
    await Promise.all([previousConnection, nextConnection]);

    expect(toast.error).not.toHaveBeenCalled();
    expect(io).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().authUser).toEqual(nextUser);
    expect(useAuthStore.getState().socket).not.toBeNull();
  });

  it('does not restore a stale auth check over a newer login', async () => {
    const oldCheck = deferred<AuthUser>();
    vi.mocked(apiService.get).mockReturnValueOnce(oldCheck.promise);
    const checking = useAuthStore.getState().checkAuth();
    const newUser = { ...user, _id: 'new-user' };
    vi.mocked(apiService.post).mockResolvedValueOnce({ user: newUser });
    await useAuthStore.getState().login({ email: newUser.email, password: 'password' });
    oldCheck.resolve(user);
    await checking;

    expect(useAuthStore.getState().authUser).toEqual(newUser);
    expect(useAuthStore.getState().isCheckingAuth).toBe(false);
  });

  it('does not restore a login response after the session has ended', async () => {
    const response = deferred<{ user: AuthUser }>();
    vi.mocked(apiService.post).mockReturnValueOnce(response.promise);
    const loggingIn = useAuthStore.getState().login({ email: user.email, password: 'password' });
    useAuthStore.getState().forceLogout(SESSION_REVOKED_MESSAGE);
    response.resolve({ user });
    await loggingIn;

    expect(useAuthStore.getState().authUser).toBeNull();
    expect(useAuthStore.getState().isLoggingIn).toBe(false);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('handles only the first HTTP failure for a revoked session', async () => {
    await connectUser();
    const failure = {
      version: getAuthSessionVersion(), code: 'SESSION_REVOKED', message: SESSION_REVOKED_MESSAGE,
    };
    reportAuthenticationFailure(failure);
    reportAuthenticationFailure(failure);

    expect(useAuthStore.getState().authUser).toBeNull();
    expect(toast.error).toHaveBeenCalledOnce();
  });

  it('detaches before manual logout so its own revocation event does not add an error toast', async () => {
    const socket = await connectUser();
    const response = deferred<unknown>();
    vi.mocked(apiService.post).mockReturnValueOnce(response.promise);
    const loggingOut = useAuthStore.getState().logout();
    socket.listeners.get('session:revoked')?.({ message: 'Your session has ended.' });
    response.resolve({});
    await loggingOut;

    expect(useAuthStore.getState().authUser).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledExactlyOnceWith('Logged out successfully');
  });

  it('waits for a pending logout before sending a new login', async () => {
    await connectUser();
    const response = deferred<unknown>();
    vi.mocked(apiService.post)
      .mockReturnValueOnce(response.promise)
      .mockResolvedValueOnce({ user });
    const loggingOut = useAuthStore.getState().logout();
    const loggingIn = useAuthStore.getState().login({ email: user.email, password: 'password' });

    expect(apiService.post).toHaveBeenCalledTimes(1);
    expect(apiService.post).toHaveBeenLastCalledWith('/auth/logout');
    response.resolve({});
    await Promise.all([loggingOut, loggingIn]);

    expect(apiService.post).toHaveBeenLastCalledWith('/auth/login', {
      email: user.email, password: 'password',
    });
    expect(useAuthStore.getState().authUser).toEqual(user);
  });

  it('replaces the socket when a shared browser cookie now belongs to a different account', async () => {
    const socket = await connectUser();
    const newUser = { ...user, _id: 'other-account' };
    const previousVersion = getAuthSessionVersion();
    vi.mocked(apiService.get).mockResolvedValueOnce(newUser);
    await useAuthStore.getState().checkAuth();
    await useAuthStore.getState().connectSocket();

    expect(useAuthStore.getState().authUser).toEqual(newUser);
    expect(useAuthStore.getState().socket).not.toBe(socket);
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(getAuthSessionVersion()).toBeGreaterThan(previousVersion);
    expect(useAuthStore.getState().isCheckingAuth).toBe(false);
  });
});
