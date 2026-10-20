import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { useAuthStore } from '@/store/useAuthStore';

vi.mock('@/pages/Login', () => ({ default: () => <h1>Login form</h1> }));
vi.mock('@/pages/SignUp', () => ({ default: () => <h1>Sign up form</h1> }));
vi.mock('@/pages/ChatPage', () => ({ default: () => <h1>Private chats</h1> }));
vi.mock('@/store/useChatStore', () => ({}));

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
  useAuthStore.setState({
    ...useAuthStore.getInitialState(),
    checkAuth: vi.fn(async () => {}),
  }, true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('initial route rendering', () => {
  it('renders the login form while the initial auth request is still pending', () => {
    render(<MemoryRouter initialEntries={['/login']}><App /></MemoryRouter>);

    expect(useAuthStore.getState().isCheckingAuth).toBe(true);
    expect(screen.getByRole('heading', { name: 'Login form' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
  });

  it('renders the public sign up form while the initial auth request is still pending', async () => {
    render(<MemoryRouter initialEntries={['/sign-up']}><App /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Sign up form' })).toBeInTheDocument();
    expect(useAuthStore.getState().isCheckingAuth).toBe(true);
  });

  it('keeps private content hidden while the session is being checked', () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Private chats' })).not.toBeInTheDocument();
  });

  it('redirects an authenticated visitor from login into the lazy chat route', async () => {
    useAuthStore.setState({
      authUser: { _id: 'user-1', fullName: 'Test User', email: 'test@example.com', profilePic: '' },
      isCheckingAuth: false,
    });
    render(<MemoryRouter initialEntries={['/login']}><App /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Private chats' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Login form' })).not.toBeInTheDocument();
  });
});
