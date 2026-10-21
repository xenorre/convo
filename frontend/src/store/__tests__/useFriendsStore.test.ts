import { beforeEach, describe, expect, it, vi } from 'vitest';
import toast from 'react-hot-toast';
import { apiService } from '@/services/apiService';
import { advanceAuthSession } from '@/services/authSession';
import type { AppSocket } from '@/types/socket';
import { notifyFriendRequest } from '@/utils/friendNotifications';
import { useAuthStore } from '../useAuthStore';
import { useFriendsStore } from '../useFriendsStore';

vi.mock('@/services/apiService', () => ({
  apiService: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/utils/friendNotifications', () => ({ notifyFriendRequest: vi.fn() }));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
}));

const me = { _id: 'me', fullName: 'Me', email: 'me@example.com', profilePic: '' };
const anna = { _id: 'anna', fullName: 'Anna', profilePic: '' };
const bob = { _id: 'bob', fullName: 'Bob', profilePic: '' };
const zoe = { _id: 'zoe', fullName: 'Zoe', profilePic: '' };
const friend = (user: typeof anna) => ({ ...user, since: '2026-10-01' });
const request = (id: string, user: typeof anna) => ({ friendRequestId: id, user, createdAt: '2026-10-20' });

const socketOn = vi.fn<(event: string, handler: (payload: unknown) => void) => void>();
const handler = (event: string) => socketOn.mock.calls.filter(([name]) => name === event).at(-1)![1];

describe('friends store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ authUser: me, socket: null });
    useFriendsStore.getState().reset();
  });

  it('loads friends and both kinds of requests together', async () => {
    vi.mocked(apiService.get).mockImplementation(async (url) =>
      url === '/friends'
        ? { friends: [friend(anna)] }
        : { incoming: [request('r1', bob)], outgoing: [request('r2', zoe)] });

    await useFriendsStore.getState().loadFriends();

    expect(useFriendsStore.getState()).toMatchObject({
      friends: [friend(anna)],
      incoming: [request('r1', bob)],
      outgoing: [request('r2', zoe)],
      hasLoaded: true,
      isLoading: false,
    });
  });

  it('drops a load that finishes after the account changed', async () => {
    const pending: Array<() => void> = [];
    vi.mocked(apiService.get).mockImplementation((url) => new Promise((resolve) => {
      pending.push(() => resolve(url === '/friends' ? { friends: [friend(anna)] } : { incoming: [], outgoing: [] }));
    }));
    const load = useFriendsStore.getState().loadFriends();

    advanceAuthSession();
    useFriendsStore.getState().reset();
    pending.forEach((finish) => finish());
    await load;

    expect(useFriendsStore.getState().friends).toEqual([]);
  });

  it('tracks a sent request, or becomes friends when they had invited us', async () => {
    vi.mocked(apiService.post).mockResolvedValueOnce({ status: 'requested', request: request('r1', bob) });
    await useFriendsStore.getState().sendRequest(bob);
    expect(apiService.post).toHaveBeenCalledWith('/friends/requests', { userId: 'bob' });
    expect(useFriendsStore.getState().outgoing).toEqual([request('r1', bob)]);

    useFriendsStore.setState({ incoming: [request('r9', zoe)] });
    vi.mocked(apiService.post).mockResolvedValueOnce({ status: 'accepted', friendRequestId: 'r9', friend: zoe });
    await useFriendsStore.getState().sendRequest(zoe);
    expect(useFriendsStore.getState().incoming).toEqual([]);
    expect(useFriendsStore.getState().friends.map((f) => f._id)).toEqual(['zoe']);
    expect(toast.success).toHaveBeenCalledWith('You and Zoe are now friends');
  });

  it('accepts, declines, cancels and removes with the right endpoints', async () => {
    vi.mocked(apiService.post).mockResolvedValue({});
    vi.mocked(apiService.delete).mockResolvedValue({});
    useFriendsStore.setState({
      friends: [friend(zoe)],
      incoming: [request('in-1', anna), request('in-2', bob)],
      outgoing: [request('out-1', { _id: 'cy', fullName: 'Cy', profilePic: '' })],
    });
    const { incoming, outgoing } = useFriendsStore.getState();

    await useFriendsStore.getState().acceptRequest(incoming[0]);
    await useFriendsStore.getState().declineRequest(incoming[1]);
    await useFriendsStore.getState().cancelRequest(outgoing[0]);
    await useFriendsStore.getState().removeFriend(zoe);

    expect(vi.mocked(apiService.post).mock.calls.map(([url]) => url)).toEqual([
      '/friends/requests/in-1/accept',
      '/friends/requests/in-2/decline',
    ]);
    expect(vi.mocked(apiService.delete).mock.calls.map(([url]) => url)).toEqual([
      '/friends/requests/out-1',
      '/friends/zoe',
    ]);
    expect(useFriendsStore.getState()).toMatchObject({ incoming: [], outgoing: [] });
    // Accepted friends stay sorted by name.
    expect(useFriendsStore.getState().friends.map((f) => f.fullName)).toEqual(['Anna']);
  });

  it('reloads when the server says the relationship already changed', async () => {
    vi.mocked(apiService.post).mockRejectedValueOnce({ status: 409, message: "You're already friends" });
    vi.mocked(apiService.get).mockImplementation(async (url) =>
      url === '/friends' ? { friends: [friend(bob)] } : { incoming: [], outgoing: [] });

    expect(await useFriendsStore.getState().sendRequest(bob)).toBeNull();
    await vi.waitFor(() => expect(useFriendsStore.getState().friends).toEqual([friend(bob)]));
    expect(toast.error).toHaveBeenCalledWith("You're already friends");
  });

  it('follows friend events on the current socket and forgets everything on logout', () => {
    const socket = { on: socketOn, off: vi.fn(), connected: true } as unknown as AppSocket;
    useAuthStore.setState({ socket });
    useFriendsStore.setState({ friends: [friend(zoe)], outgoing: [request('out-1', anna)] });

    handler('friend:request')({ request: request('in-1', bob) });
    expect(useFriendsStore.getState().incoming).toEqual([request('in-1', bob)]);
    expect(notifyFriendRequest).toHaveBeenCalledWith(request('in-1', bob));

    handler('friend:accepted')({ friendRequestId: 'out-1', friend: anna });
    expect(useFriendsStore.getState().outgoing).toEqual([]);
    expect(useFriendsStore.getState().friends.map((f) => f._id)).toEqual(['anna', 'zoe']);

    handler('friend:request:removed')({ friendRequestId: 'in-1' });
    expect(useFriendsStore.getState().incoming).toEqual([]);

    handler('friend:removed')({ userId: 'zoe' });
    expect(useFriendsStore.getState().friends.map((f) => f._id)).toEqual(['anna']);

    useAuthStore.setState({ authUser: null, socket: null });
    expect(socket.off).toHaveBeenCalledWith('friend:request', expect.any(Function));

    useAuthStore.setState({ authUser: { ...me, _id: 'other' } });
    useAuthStore.setState({ authUser: me });
    expect(useFriendsStore.getState().friends).toEqual([]);
  });
});
