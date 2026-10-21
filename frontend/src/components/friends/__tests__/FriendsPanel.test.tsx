import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiService } from '@/services/apiService';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { useFriendsStore } from '@/store/useFriendsStore';
import ActiveTabSwitch from '@/components/ActiveTabSwitch';
import FriendsPanel from '../FriendsPanel';

vi.mock('@/services/apiService', () => ({
  apiService: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
}));

const person = (id: string, fullName: string) => ({ _id: id, fullName, profilePic: '' });
const anna = person('anna', 'Anna Kowalska');
const bob = person('bob', 'Bob Builder');
const cyd = person('cyd', 'Cyd Charisse');
const dan = person('dan', 'Dan Lis');
const since = '2026-10-01';

describe('Friends panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ authUser: { ...anna, _id: 'me', email: 'me@example.com' }, onlineUsers: ['anna'] });
    useChatStore.setState({ ...useChatStore.getInitialState() });
    useFriendsStore.setState({
      ...useFriendsStore.getInitialState(),
      hasLoaded: true,
      friends: [{ ...anna, since }, { ...bob, since }],
      incoming: [{ friendRequestId: 'in-1', user: cyd, createdAt: since }],
      outgoing: [{ friendRequestId: 'out-1', user: dan, createdAt: since }],
    });
  });

  it('shows requests first, then friends split by presence', () => {
    render(<FriendsPanel />);

    const requests = screen.getByRole('region', { name: 'Friend requests' });
    expect(within(requests).getByText('Requests (2)')).toBeInTheDocument();
    expect(within(requests).getByText('Friend request')).toBeInTheDocument();
    expect(within(requests).getByText('Request sent')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Online friends' })).getByText('Anna Kowalska')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Offline friends' })).getByText('Bob Builder')).toBeInTheDocument();
  });

  it('accepts and declines from the request row', async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.post).mockResolvedValue({});
    render(<FriendsPanel />);

    await user.click(screen.getByRole('button', { name: "Accept Cyd Charisse's friend request" }));
    expect(apiService.post).toHaveBeenCalledWith('/friends/requests/in-1/accept', {});
    expect(await screen.findByText('Cyd Charisse')).toBeInTheDocument();
    expect(useFriendsStore.getState().incoming).toEqual([]);

    vi.mocked(apiService.delete).mockResolvedValue({});
    await user.click(screen.getByRole('button', { name: 'Cancel friend request to Dan Lis' }));
    expect(apiService.delete).toHaveBeenCalledWith('/friends/requests/out-1');
    expect(screen.queryByRole('region', { name: 'Friend requests' })).toBeNull();
  });

  it('opens a chat from a friend row and removes a friend from its actions', async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.delete).mockResolvedValue({});
    render(<FriendsPanel />);

    await user.click(screen.getByRole('button', { name: 'Bob Builder, offline' }));
    expect(useChatStore.getState().selectedUser).toEqual(bob);

    const more = screen.getByRole('button', { name: 'More actions for Bob Builder' });
    await user.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: 'Remove friend' }));

    expect(apiService.delete).toHaveBeenCalledWith('/friends/bob');
    expect(screen.queryByText('Bob Builder')).toBeNull();
  });

  it('filters friends and hides requests while searching', async () => {
    const user = userEvent.setup();
    render(<FriendsPanel />);

    await user.type(screen.getByRole('searchbox', { name: 'Search friends' }), 'kowal');
    expect(screen.queryByRole('region', { name: 'Friend requests' })).toBeNull();
    expect(screen.getByText('Anna Kowalska')).toBeInTheDocument();
    expect(screen.queryByText('Bob Builder')).toBeNull();

    await user.type(screen.getByRole('searchbox', { name: 'Search friends' }), 'zzz');
    expect(screen.getByRole('status')).toHaveTextContent('No friends match');
  });

  it('invites people to add friends when the list is empty', async () => {
    const user = userEvent.setup();
    useFriendsStore.setState({ friends: [], incoming: [], outgoing: [] });
    render(<FriendsPanel />);

    expect(screen.getByText('No friends yet')).toBeInTheDocument();
    // The toolbar icon and the empty state both open the search.
    const addButtons = screen.getAllByRole('button', { name: 'Add friend' });
    expect(addButtons).toHaveLength(2);
    await user.click(addButtons[1]);
    expect(screen.getByRole('searchbox', { name: 'Search people by name' })).toHaveFocus();
  });

  it('counts pending requests on the Friends tab', () => {
    render(<ActiveTabSwitch />);
    expect(screen.getByRole('button', { name: /Friends/ })).toHaveTextContent('1');
    expect(screen.getByLabelText('1 pending friend requests')).toBeInTheDocument();

    act(() => useFriendsStore.setState({ incoming: [] }));
    expect(screen.queryByLabelText(/pending friend requests/)).toBeNull();
  });
});

describe('Add friend search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({ ...useChatStore.getInitialState() });
    useAuthStore.setState({ authUser: { ...anna, _id: 'me', email: 'me@example.com' }, onlineUsers: [] });
    useFriendsStore.setState({
      ...useFriendsStore.getInitialState(),
      hasLoaded: true,
      friends: [{ ...anna, since }],
      incoming: [{ friendRequestId: 'in-1', user: cyd, createdAt: since }],
      outgoing: [{ friendRequestId: 'out-1', user: dan, createdAt: since }],
    });
  });

  const openSearch = async (user: ReturnType<typeof userEvent.setup>) => {
    render(<FriendsPanel />);
    await user.click(screen.getByRole('button', { name: 'Add friend' }));
    return screen.getByRole('searchbox', { name: 'Search people by name' });
  };

  it('waits for three letters, then searches and offers the right action per person', async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.get).mockResolvedValue({
      users: [anna, bob, cyd, dan].map((u) => ({ ...u, relationship: { state: 'none' } })),
    });
    const input = await openSearch(user);

    await user.type(input, 'an');
    expect(screen.getByText(/Type at least 3 letters/)).toBeInTheDocument();
    expect(apiService.get).not.toHaveBeenCalled();

    await user.type(input, 'n');
    expect(await screen.findByText('4 people found')).toBeInTheDocument();
    expect(apiService.get).toHaveBeenCalledExactlyOnceWith('/users/search', { params: { q: 'ann' } });
    // The live friends store decides the action, not the stale search result.
    expect(screen.getByRole('button', { name: 'Message Anna Kowalska' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Bob Builder as a friend' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Accept Cyd Charisse's friend request" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel friend request to Dan Lis' })).toBeInTheDocument();

    vi.mocked(apiService.post).mockResolvedValueOnce({
      status: 'requested',
      request: { friendRequestId: 'out-2', user: bob, createdAt: since },
    });
    await user.click(screen.getByRole('button', { name: 'Add Bob Builder as a friend' }));
    expect(apiService.post).toHaveBeenCalledWith('/friends/requests', { userId: 'bob' });
    expect(await screen.findByRole('button', { name: 'Cancel friend request to Bob Builder' })).toBeInTheDocument();
  });

  it('explains when nobody matches or the search is rate limited', async () => {
    const user = userEvent.setup();
    vi.mocked(apiService.get).mockResolvedValueOnce({ users: [] });
    const input = await openSearch(user);

    await user.type(input, 'nobody');
    expect(await screen.findByText(/No one found for/)).toHaveTextContent('No one found for “nobody”');

    vi.mocked(apiService.get).mockRejectedValueOnce({ status: 429, message: 'Too many requests. Try again later.' });
    await user.type(input, 'x');
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests. Try again later.');
  });

  it('returns to the friends list', async () => {
    const user = userEvent.setup();
    await openSearch(user);

    await user.click(screen.getByRole('button', { name: 'Back to friends' }));
    expect(screen.getByRole('searchbox', { name: 'Search friends' })).toBeInTheDocument();
  });
});
