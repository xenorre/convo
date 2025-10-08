import { create } from 'zustand';
import { apiService } from '@/services/apiService';
import toast from 'react-hot-toast';
import type { AuthState } from '@/types/auth';
import { io } from 'socket.io-client';
import type { AppSocket } from '@/types/socket';
import { env } from '@/config/env';
import { handleStoreError, isAuthError } from '@/utils/errorHandling';
import type { AuthResponse } from '@/types/api';

export const useAuthStore = create<AuthState>((set, get) => ({
  authUser: null,
  isCheckingAuth: true,
  isSigningUp: false,

  isLoggingIn: false,
  socket: null,
  onlineUsers: [],
  checkAuth: async () => {
    try {
      const data = await apiService.get<{
        _id: string;
        email: string;
        fullName: string;
        profilePic: string;
      }>('/auth/check');
      set({ authUser: data });
      get().connectSocket();
    } catch (e) {
      const error = handleStoreError(e);
      set({ authUser: null });

      // Don't show error toast for auth check failures (silent)
      if (!isAuthError(error)) {
        console.error('Unexpected auth check error:', error);
      }
    } finally {
      set({ isCheckingAuth: false });
    }
  },

  signUp: async data => {
    set({ isSigningUp: true });
    try {
      // Create account
      await apiService.post<AuthResponse>('/auth/sign-up', data);

      // Immediately re-check auth to get the canonical user from the server
      // (avoids any drift between signup response and subsequent socket/HTTP IDs)
      await get().checkAuth();

      toast.success('Account created successfully');
      // Note: connectSocket is invoked by checkAuth after setting authUser
    } catch (e: unknown) {
      handleStoreError(e, 'Failed to create account');
    } finally {
      set({ isSigningUp: false });
    }
  },

  login: async data => {
    set({ isLoggingIn: true });
    try {
      const response = await apiService.post<AuthResponse>('/auth/login', data);

      // Check if response has user property or not
      const userData = response.user || response;
      set({ authUser: userData });

      toast.success('Logged in successfully');
      get().connectSocket();
    } catch (e: unknown) {
      handleStoreError(e, 'Login failed');
    } finally {
      set({ isLoggingIn: false });
    }
  },

  logout: async () => {
    try {
      await apiService.post('/auth/logout');
      toast.success('Logged out successfully');
      set({ authUser: null });
      get().disconnectSocket();
    } catch (e: unknown) {
      handleStoreError(e, 'Logout failed');
      // Force logout on client side even if server request fails
      set({ authUser: null });
      get().disconnectSocket();
    }
  },

  connectSocket: () => {
    const { authUser } = useAuthStore.getState();
    if (!authUser || get().socket?.connected) return;

    const socket: AppSocket = io(env.wsUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      timeout: 20000,
      forceNew: false,
    });

    socket.connect();

    set({ socket });

    socket.on('getOnlineUsers', userIds => {
      set({ onlineUsers: userIds });
    });
  },

  disconnectSocket: () => {
    const socket = get().socket;
    if (socket?.connected) socket.disconnect();
  },
}));
