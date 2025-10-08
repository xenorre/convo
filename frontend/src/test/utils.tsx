import { type ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { vi } from 'vitest';

// Mock Zustand stores for testing
export const mockAuthStore = {
  authUser: {
    _id: '1',
    email: 'test@example.com',
    fullName: 'Test User',
    profilePic: 'https://example.com/avatar.jpg',
  },
  isCheckingAuth: false,
  isLoggingIn: false,
  isSigningUp: false,
  socket: null,
  onlineUsers: [],
  checkAuth: vi.fn(),
  login: vi.fn(),
  signUp: vi.fn(),
  logout: vi.fn(),
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
};

export const mockChatStore = {
  allContacts: [],
  chats: [],
  messages: [],
  activeTab: 'chats' as const,
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,
  setActiveTab: vi.fn(),
  setSelectedUser: vi.fn(),
  getAllContacts: vi.fn(),
  getMyChatPartners: vi.fn(),
  getMessagesByUserId: vi.fn(),
  sendMessage: vi.fn(),
  subscribeToMessages: vi.fn(),
  unsubscribeFromMessage: vi.fn(),
};

// Custom render function that includes providers
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        {children}
      </ErrorBoundary>
    </BrowserRouter>
  );
};

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllTheProviders, ...options });

export * from '@testing-library/react';
export { customRender as render };