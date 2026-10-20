import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import App from '@/App';
import { useAuthStore } from '@/store/useAuthStore';

vi.mock('@/services/apiService', () => ({
  apiService: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), uploadFile: vi.fn() },
}));

const account = { _id: 'me', fullName: 'Ada Lovelace', email: 'ada@example.com', profilePic: '' };
const checkAuth = useAuthStore.getState().checkAuth;

const renderAt = (path: string) =>
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

const panels = () => ({
  list: screen.getByRole('complementary', { name: 'Settings' }),
  content: screen.getByRole('region', { name: 'Settings section' }),
});

describe('Settings page', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })));
    useAuthStore.setState({ authUser: account, isCheckingAuth: false, socket: null, checkAuth: vi.fn(async () => {}) });
  });

  afterEach(() => {
    cleanup();
    useAuthStore.setState({ authUser: null, checkAuth });
    vi.unstubAllGlobals();
  });

  it('shows the section list alone on phones and the first section next to it on desktop', async () => {
    renderAt('/settings');

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    const { list, content } = panels();
    expect(list).toHaveClass('flex');
    expect(content).toHaveClass('hidden', 'md:flex');
    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument();

    const profileLink = screen.getByRole('link', { name: /Profile/ });
    expect(profileLink).not.toHaveAttribute('aria-current');
    expect(profileLink.className).toContain('md:bg-cyan-500/15');
    expect(screen.getByRole('link', { name: 'Back to chats' })).toHaveAttribute('href', '/');
  });

  it('opens a section in place of the list on phones', async () => {
    renderAt('/settings/about');

    expect(await screen.findByRole('heading', { name: 'About' })).toBeInTheDocument();
    const { list, content } = panels();
    expect(list).toHaveClass('hidden', 'md:flex');
    expect(content).toHaveClass('flex');
    expect(screen.getByRole('link', { name: /About/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Back to settings' })).toHaveAttribute('href', '/settings');
    expect(screen.getByText(__APP_VERSION__)).toBeInTheDocument();
  });

  it('sends unknown sections back to the list', async () => {
    renderAt('/settings/nope');

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(panels().list).toHaveClass('flex');
  });

  it('requires a signed-in user', async () => {
    useAuthStore.setState({ authUser: null });
    renderAt('/settings/profile');

    expect(await screen.findByRole('button', { name: /Sign In/ })).toBeInTheDocument();
  });
});
