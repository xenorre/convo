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

describe('reconnecting', () => {
  // A socket that lost its connection and is waiting to retry.
  const connectRetryingSocket = async () => {
    const socket = Object.assign(createSocket(), { active: true });
    vi.mocked(io).mockReturnValueOnce(socket as unknown as ReturnType<typeof io>);
    useAuthStore.setState({ authUser: user });
    await useAuthStore.getState().connectSocket();
    socket.connect.mockClear();
    return socket;
  };

  const setVisibility = (state: DocumentVisibilityState) =>
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });

  it('keeps retrying until logout instead of giving up', async () => {
    await connectRetryingSocket();
    expect(vi.mocked(io).mock.calls[0][1]).toMatchObject({ reconnection: true, reconnectionAttempts: Infinity });
  });

  it('retries right away when the network returns or the tab comes back to the front', async () => {
    const socket = await connectRetryingSocket();

    window.dispatchEvent(new Event('online'));
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(socket.connect).toHaveBeenCalledOnce();

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(socket.connect).toHaveBeenCalledOnce();

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(socket.connect).toHaveBeenCalledTimes(2);
  });

  it('leaves a working connection, or one the server closed on purpose, alone', async () => {
    const socket = await connectRetryingSocket();
    socket.connected = true;
    window.dispatchEvent(new Event('online'));

    socket.connected = false;
    socket.active = false;
    window.dispatchEvent(new Event('online'));

    expect(socket.connect).not.toHaveBeenCalled();
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('stops listening after logout', async () => {
    const socket = await connectRetryingSocket();
    useAuthStore.getState().disconnectSocket();
    socket.disconnect.mockClear();

    window.dispatchEvent(new Event('online'));

    expect(socket.connect).not.toHaveBeenCalled();
    expect(socket.disconnect).not.toHaveBeenCalled();
  });
});

describe('email confirmation', () => {
  it('sign-up waits for the email to be confirmed instead of signing in', async () => {
    vi.mocked(apiService.post).mockResolvedValueOnce({ status: 'verification_required', email: 'new@example.com' });

    const outcome = await useAuthStore.getState().signUp({ fullName: 'New', email: 'new@example.com', password: 'x' });

    expect(outcome).toEqual({ kind: 'verify', email: 'new@example.com', emailSent: true });
    expect(useAuthStore.getState().authUser).toBeNull();
    expect(apiService.get).not.toHaveBeenCalled();
    expect(io).not.toHaveBeenCalled();
  });

  it('passes on that the first email could not be sent', async () => {
    vi.mocked(apiService.post).mockResolvedValueOnce({ status: 'verification_required', email: 'new@example.com', emailSent: false });

    const outcome = await useAuthStore.getState().signUp({ fullName: 'New', email: 'new@example.com', password: 'x' });

    expect(outcome).toEqual({ kind: 'verify', email: 'new@example.com', emailSent: false });
  });

  it('a login that needs confirming says so instead of showing an error', async () => {
    vi.mocked(apiService.post).mockRejectedValueOnce({
      status: 403, code: 'EMAIL_NOT_VERIFIED', message: 'Confirm your email to sign in.',
    });

    const outcome = await useAuthStore.getState().login({ email: 'ann@example.com', password: 'right' });

    expect(outcome).toEqual({ unverifiedEmail: 'ann@example.com' });
    expect(toast.error).not.toHaveBeenCalled();
    expect(useAuthStore.getState().authUser).toBeNull();
  });

  it('a confirmed link signs in and connects', async () => {
    vi.mocked(apiService.post).mockResolvedValueOnce({ user });

    expect(await useAuthStore.getState().verifyEmail('token')).toBe(true);

    expect(apiService.post).toHaveBeenCalledWith('/auth/verify-email', { token: 'token' });
    expect(useAuthStore.getState().authUser).toEqual(user);
    await vi.waitFor(() => expect(io).toHaveBeenCalled());
  });

  it('a broken link leaves whoever is signed in alone', async () => {
    useAuthStore.setState({ authUser: user, isCheckingAuth: false });
    vi.mocked(apiService.post).mockRejectedValueOnce({ status: 400, code: 'VERIFICATION_INVALID', message: 'x' });

    expect(await useAuthStore.getState().verifyEmail('used-token')).toBe(false);
    expect(useAuthStore.getState().authUser).toEqual(user);
  });

  it('a broken link signs nobody in and stays quiet', async () => {
    vi.mocked(apiService.post).mockRejectedValueOnce({ status: 400, code: 'VERIFICATION_INVALID', message: 'x' });

    expect(await useAuthStore.getState().verifyEmail('token')).toBe(false);
    expect(useAuthStore.getState().authUser).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
