import { create } from 'zustand';
import { apiService } from '@/services/apiService';
import toast from 'react-hot-toast';
import type { AuthState, AuthUser } from '@/types/auth';
import type { AppSocket } from '@/types/socket';
import { env } from '@/config/env';
import { createApiError, handleStoreError, isAuthError } from '@/utils/errorHandling';
import type { AuthResponse } from '@/types/api';
import {
  advanceAuthSession,
  getAuthSessionVersion,
  isCurrentAuthSession,
  registerAuthenticationFailureHandler,
  SESSION_EXPIRED_MESSAGE,
  SESSION_REVOKED_MESSAGE,
} from '@/services/authSession';

let latestAuthCheck = 0;
let pendingLogout: Promise<void> | undefined;
let latestSocketConnection = 0;
let pendingSocketConnection: Promise<void> | undefined;
let socketClientModule: Promise<typeof import('socket.io-client')> | undefined;

const loadSocketClient = () => socketClientModule ??= import('socket.io-client').catch(error => {
  socketClientModule = undefined;
  throw error;
});

export const useAuthStore = create<AuthState>((set, get) => ({
  authUser: null,
  isCheckingAuth: true,
  isSigningUp: false,
  isLoggingIn: false,
  socket: null,
  onlineUsers: [],

  checkAuth: async () => {
    const sessionVersion = getAuthSessionVersion();
    const request = ++latestAuthCheck;
    const isCurrentCheck = () =>
      isCurrentAuthSession(sessionVersion) && request === latestAuthCheck;

    try {
      const data = await apiService.get<AuthUser>('/auth/check');
      if (!isCurrentCheck()) return;
      if (get().authUser && get().authUser?._id !== data._id) {
        advanceAuthSession();
        get().disconnectSocket();
      }
      set({ authUser: data, isCheckingAuth: false });
      get().connectSocket();
    } catch (e) {
      if (!isCurrentCheck()) return;
      const error = createApiError(e);
      if (isAuthError(error)) {
        if (get().authUser || error.code === 'SESSION_REVOKED') {
          get().forceLogout(
            error.code === 'SESSION_REVOKED' ? SESSION_REVOKED_MESSAGE : SESSION_EXPIRED_MESSAGE,
            sessionVersion
          );
        } else {
          set({ authUser: null });
          get().disconnectSocket();
        }
      } else {
        handleStoreError(error);
      }
    } finally {
      if (isCurrentCheck()) set({ isCheckingAuth: false });
    }
  },

  signUp: async data => {
    // The browser applies logout's Set-Cookie before this promise settles.
    // Wait for it so a late logout cannot erase the next login's cookie.
    if (pendingLogout) await pendingLogout;
    const sessionVersion = advanceAuthSession();
    get().disconnectSocket();
    set({ authUser: null, isSigningUp: true, isCheckingAuth: false });
    try {
      await apiService.post<AuthResponse>('/auth/sign-up', data);
      if (!isCurrentAuthSession(sessionVersion)) return;

      // Re-check the account to use the canonical server user and IDs.
      await get().checkAuth();
      if (isCurrentAuthSession(sessionVersion) && get().authUser) {
        toast.success('Account created successfully');
      }
    } catch (e: unknown) {
      if (isCurrentAuthSession(sessionVersion)) handleStoreError(e, 'Failed to create account');
    } finally {
      if (isCurrentAuthSession(sessionVersion)) set({ isSigningUp: false });
    }
  },

  login: async data => {
    if (pendingLogout) await pendingLogout;
    const sessionVersion = advanceAuthSession();
    get().disconnectSocket();
    set({ authUser: null, isLoggingIn: true, isCheckingAuth: false });
    try {
      const response = await apiService.post<AuthResponse>('/auth/login', data);
      if (!isCurrentAuthSession(sessionVersion)) return;
      const userData = response.user || response;
      set({ authUser: userData });

      toast.success('Logged in successfully');
      get().connectSocket();
    } catch (e: unknown) {
      if (isCurrentAuthSession(sessionVersion)) handleStoreError(e, 'Login failed');
    } finally {
      if (isCurrentAuthSession(sessionVersion)) set({ isLoggingIn: false });
    }
  },

  logout: () => {
    if (pendingLogout) return pendingLogout;
    // Detach the current client before the server notifies other tabs of logout.
    const sessionVersion = advanceAuthSession();
    get().disconnectSocket();
    set({ authUser: null, isCheckingAuth: false, isLoggingIn: false, isSigningUp: false });
    toast.dismiss();
    const logoutRequest = apiService.post('/auth/logout').then(() => {
      if (isCurrentAuthSession(sessionVersion)) toast.success('Logged out successfully');
    }).catch((e: unknown) => {
      if (isCurrentAuthSession(sessionVersion)) handleStoreError(e, 'Logout failed');
    }).finally(() => {
      if (pendingLogout === logoutRequest) pendingLogout = undefined;
    });
    pendingLogout = logoutRequest;
    return logoutRequest;
  },

  updateAuthUser: user => {
    const current = get().authUser;
    if (!current || current._id !== user._id) return;
    set({
      authUser: {
        _id: current._id,
        email: user.email ?? current.email,
        fullName: user.fullName ?? current.fullName,
        profilePic: user.profilePic ?? current.profilePic,
      },
    });
  },

  forceLogout: (message = SESSION_EXPIRED_MESSAGE, sessionVersion = getAuthSessionVersion()) => {
    if (!isCurrentAuthSession(sessionVersion)) return;
    advanceAuthSession();
    get().disconnectSocket();
    set({ authUser: null, isCheckingAuth: false, isLoggingIn: false, isSigningUp: false });
    toast.dismiss();
    toast.error(message, { id: 'session-ended', duration: 7000 });
  },

  connectSocket: () => {
    const authUser = get().authUser;
    if (!authUser || get().socket) return Promise.resolve();
    if (pendingSocketConnection) return pendingSocketConnection;
    const sessionVersion = getAuthSessionVersion();
    const userId = authUser._id;
    const request = ++latestSocketConnection;
    const isCurrentConnection = () => request === latestSocketConnection
      && isCurrentAuthSession(sessionVersion) && get().authUser?._id === userId;

    // Load the chat lifecycle before connecting so even the first incoming
    // packet has handlers on every private route. Cancelled sessions must not
    // create sockets when either module finishes loading later.
    const connection = Promise.all([
      loadSocketClient(),
      import('./useChatStore'),
    ]).then(([{ io }]) => {
      if (!isCurrentConnection() || get().socket) return;
      const socket: AppSocket = io(env.wsUrl, {
        withCredentials: true,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
        timeout: 20000,
        forceNew: false,
        autoConnect: false,
      });
      const isCurrentSocket = () =>
        get().socket === socket && isCurrentAuthSession(sessionVersion);

      set({ socket });
      socket.on('getOnlineUsers', userIds => {
        if (isCurrentSocket()) set({ onlineUsers: userIds });
      });
      socket.on('session:revoked', data => {
        if (isCurrentSocket()) get().forceLogout(data.message || SESSION_REVOKED_MESSAGE, sessionVersion);
      });
      socket.on('connect_error', error => {
        if (!isCurrentSocket()) return;
        const data = (error as Error & { data?: { code?: string; message?: string } }).data;
        if (data?.code === 'SESSION_REVOKED' || data?.code === 'UNAUTHORIZED') {
          get().forceLogout(
            data.message || (data.code === 'SESSION_REVOKED' ? SESSION_REVOKED_MESSAGE : SESSION_EXPIRED_MESSAGE),
            sessionVersion
          );
        }
      });
      socket.connect();
    }).catch(error => {
      if (isCurrentConnection()) handleStoreError(error, 'Could not connect to chat. Please reload the page.');
    }).finally(() => {
      if (pendingSocketConnection === connection) pendingSocketConnection = undefined;
    });
    pendingSocketConnection = connection;
    return connection;
  },

  disconnectSocket: () => {
    latestSocketConnection++;
    pendingSocketConnection = undefined;
    const socket = get().socket;
    set({ socket: null, onlineUsers: [] });
    if (!socket) return;
    socket.off('getOnlineUsers');
    socket.off('session:revoked');
    socket.off('connect_error');
    socket.disconnect();
  },
}));

registerAuthenticationFailureHandler(({ version, code, message }) => {
  // An anonymous initial /auth/check should open login without a notification.
  if (useAuthStore.getState().authUser || code === 'SESSION_REVOKED') {
    useAuthStore.getState().forceLogout(message, version);
  }
});
