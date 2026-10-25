import { create } from "zustand";
import toast from "react-hot-toast";
import { apiService } from "@/services/apiService";
import { getAuthSessionVersion, isCurrentAuthSession } from "@/services/authSession";
import type { Contact } from "@/types/auth";
import type {
  BlockedUser,
  BlockedUsersResponse,
  BlockResponse,
  Friend,
  FriendRequest,
  FriendRequestsResponse,
  FriendsResponse,
  SendFriendRequestResponse,
} from "@/types/friends";
import type { AppSocket } from "@/types/socket";
import { createApiError, handleStoreError } from "@/utils/errorHandling";
import { notifyFriendRequest } from "@/utils/friendNotifications";
import { useAuthStore } from "./useAuthStore";

interface FriendsState {
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  blocked: BlockedUser[];
  hasLoaded: boolean;
  isLoading: boolean;
  boundSocket: AppSocket | null;
  unbindSocket: (() => void) | null;
  loadFriends: () => Promise<void>;
  sendRequest: (user: Contact) => Promise<SendFriendRequestResponse | null>;
  acceptRequest: (request: FriendRequest) => Promise<boolean>;
  declineRequest: (request: FriendRequest) => Promise<boolean>;
  cancelRequest: (request: FriendRequest) => Promise<boolean>;
  removeFriend: (friend: Contact) => Promise<boolean>;
  blockUser: (user: Contact) => Promise<boolean>;
  unblockUser: (user: Contact) => Promise<boolean>;
  bindSocket: (socket: AppSocket) => void;
  reset: () => void;
}

const toContact = ({ _id, fullName, profilePic }: Contact): Contact => ({ _id, fullName, profilePic });

// Keeps the list unique and in the server's alphabetical order.
const withFriend = (friends: Friend[], contact: Contact): Friend[] =>
  [
    ...friends.filter((friend) => friend._id !== contact._id),
    { ...toContact(contact), since: new Date().toISOString() },
  ].sort((a, b) => a.fullName.localeCompare(b.fullName));

const withoutRequest = (requests: FriendRequest[], friendRequestId: string) =>
  requests.filter((request) => request.friendRequestId !== friendRequestId);

// Client errors carry a useful server message ("already friends", "too many
// requests"); anything else gets the generic fallback.
const reportError = (error: unknown, fallback: string) => {
  const apiError = createApiError(error);
  handleStoreError(error, apiError.status >= 400 && apiError.status < 500 ? apiError.message : fallback);
  return apiError;
};

export const useFriendsStore = create<FriendsState>((set, get) => {
  // Runs a request and drops its result when the account changed meanwhile.
  const guarded = async <T>(request: () => Promise<T>, apply: (result: T) => void, fallback: string) => {
    const sessionVersion = getAuthSessionVersion();
    try {
      const result = await request();
      if (!isCurrentAuthSession(sessionVersion)) return false;
      apply(result);
      return true;
    } catch (error) {
      if (!isCurrentAuthSession(sessionVersion)) return false;
      const apiError = reportError(error, fallback);
      // Someone else changed the relationship first; show what is true now.
      if (apiError.status === 404 || apiError.status === 409) void get().loadFriends();
      return false;
    }
  };

  return {
    friends: [],
    incoming: [],
    outgoing: [],
    blocked: [],
    hasLoaded: false,
    isLoading: false,
    boundSocket: null,
    unbindSocket: null,

    loadFriends: async () => {
      const sessionVersion = getAuthSessionVersion();
      set({ isLoading: true });
      try {
        const [{ friends }, { incoming, outgoing }, { users: blocked }] = await Promise.all([
          apiService.get<FriendsResponse>("/friends"),
          apiService.get<FriendRequestsResponse>("/friends/requests"),
          apiService.get<BlockedUsersResponse>("/users/blocked"),
        ]);
        if (!isCurrentAuthSession(sessionVersion)) return;
        set({ friends, incoming, outgoing, blocked, hasLoaded: true });
      } catch (error) {
        if (isCurrentAuthSession(sessionVersion)) handleStoreError(error, "Failed to load friends");
      } finally {
        if (isCurrentAuthSession(sessionVersion)) set({ isLoading: false });
      }
    },

    sendRequest: async (user) => {
      let response: SendFriendRequestResponse | null = null;
      await guarded(
        () => apiService.post<SendFriendRequestResponse>("/friends/requests", { userId: user._id }),
        (result) => {
          response = result;
          if (result.status === "accepted") {
            set((state) => ({
              friends: withFriend(state.friends, result.friend),
              incoming: withoutRequest(state.incoming, result.friendRequestId),
            }));
            toast.success(`You and ${result.friend.fullName} are now friends`);
          } else {
            set((state) => ({
              outgoing: [result.request, ...withoutRequest(state.outgoing, result.request.friendRequestId)],
            }));
          }
        },
        "Couldn't send the friend request. Try again later.",
      );
      return response;
    },

    acceptRequest: (request) =>
      guarded(
        () => apiService.post(`/friends/requests/${request.friendRequestId}/accept`, {}),
        () =>
          set((state) => ({
            friends: withFriend(state.friends, request.user),
            incoming: withoutRequest(state.incoming, request.friendRequestId),
          })),
        "Couldn't accept the request. Try again later.",
      ),

    declineRequest: (request) =>
      guarded(
        () => apiService.post(`/friends/requests/${request.friendRequestId}/decline`, {}),
        () => set((state) => ({ incoming: withoutRequest(state.incoming, request.friendRequestId) })),
        "Couldn't decline the request. Try again later.",
      ),

    cancelRequest: (request) =>
      guarded(
        () => apiService.delete(`/friends/requests/${request.friendRequestId}`),
        () => set((state) => ({ outgoing: withoutRequest(state.outgoing, request.friendRequestId) })),
        "Couldn't cancel the request. Try again later.",
      ),

    removeFriend: (friend) =>
      guarded(
        () => apiService.delete(`/friends/${friend._id}`),
        () => {
          set((state) => ({ friends: state.friends.filter(({ _id }) => _id !== friend._id) }));
          toast.success(`Removed ${friend.fullName} from friends`);
        },
        "Couldn't remove the friend. Try again later.",
      ),

    // Blocking also ends a friendship or request with them on the server.
    blockUser: (user) =>
      guarded(
        () => apiService.post<BlockResponse>(`/users/${user._id}/block`, {}),
        () => {
          set((state) => ({
            friends: state.friends.filter(({ _id }) => _id !== user._id),
            incoming: state.incoming.filter((request) => request.user._id !== user._id),
            outgoing: state.outgoing.filter((request) => request.user._id !== user._id),
            blocked: [
              { ...toContact(user), blockedAt: new Date().toISOString() },
              ...state.blocked.filter(({ _id }) => _id !== user._id),
            ],
          }));
          toast.success(`Blocked ${user.fullName}`);
        },
        "Couldn't block this person. Try again later.",
      ),

    unblockUser: (user) =>
      guarded(
        () => apiService.delete(`/users/${user._id}/block`),
        () => {
          set((state) => ({ blocked: state.blocked.filter(({ _id }) => _id !== user._id) }));
          toast.success(`Unblocked ${user.fullName}`);
        },
        "Couldn't unblock this person. Try again later.",
      ),

    bindSocket: (socket) => {
      if (get().boundSocket === socket) return;
      get().unbindSocket?.();
      const sessionVersion = getAuthSessionVersion();
      const isActive = () =>
        isCurrentAuthSession(sessionVersion) && get().boundSocket === socket
        && useAuthStore.getState().socket === socket;

      const handlers = {
        "friend:request": ({ request }: { request: FriendRequest }) => {
          if (!isActive()) return;
          set((state) => ({ incoming: [request, ...withoutRequest(state.incoming, request.friendRequestId)] }));
          notifyFriendRequest(request);
        },
        "friend:accepted": ({ friendRequestId, friend }: { friendRequestId: string; friend: Contact }) => {
          if (!isActive()) return;
          set((state) => ({
            friends: withFriend(state.friends, friend),
            outgoing: withoutRequest(state.outgoing, friendRequestId),
            incoming: withoutRequest(state.incoming, friendRequestId),
          }));
        },
        "friend:request:removed": ({ friendRequestId }: { friendRequestId: string }) => {
          if (!isActive()) return;
          set((state) => ({
            incoming: withoutRequest(state.incoming, friendRequestId),
            outgoing: withoutRequest(state.outgoing, friendRequestId),
          }));
        },
        "friend:removed": ({ userId }: { userId: string }) => {
          if (!isActive()) return;
          set((state) => ({ friends: state.friends.filter(({ _id }) => _id !== userId) }));
        },
        // Their friendships, requests and blocks were deleted with the account.
        "account:deleted": ({ userId }: { userId: string }) => {
          if (!isActive()) return;
          set((state) => ({
            friends: state.friends.filter(({ _id }) => _id !== userId),
            incoming: state.incoming.filter((request) => request.user._id !== userId),
            outgoing: state.outgoing.filter((request) => request.user._id !== userId),
            blocked: state.blocked.filter(({ _id }) => _id !== userId),
          }));
        },
      } as const;

      // Events missed while disconnected are picked up by reloading.
      let hasConnected = socket.connected;
      const onConnect = () => {
        if (!isActive()) return;
        if (hasConnected && get().hasLoaded) void get().loadFriends();
        hasConnected = true;
      };

      socket.on("friend:request", handlers["friend:request"]);
      socket.on("friend:accepted", handlers["friend:accepted"]);
      socket.on("friend:request:removed", handlers["friend:request:removed"]);
      socket.on("friend:removed", handlers["friend:removed"]);
      socket.on("account:deleted", handlers["account:deleted"]);
      socket.on("connect", onConnect);
      set({
        boundSocket: socket,
        unbindSocket: () => {
          socket.off("friend:request", handlers["friend:request"]);
          socket.off("friend:accepted", handlers["friend:accepted"]);
          socket.off("friend:request:removed", handlers["friend:request:removed"]);
          socket.off("friend:removed", handlers["friend:removed"]);
          socket.off("account:deleted", handlers["account:deleted"]);
          socket.off("connect", onConnect);
        },
      });
    },

    reset: () => {
      get().unbindSocket?.();
      set(useFriendsStore.getInitialState());
    },
  };
});

// Same lifecycle as the chat store: private data goes away with the account,
// and listeners follow the current socket.
const unsubscribeAuth = useAuthStore.subscribe((state, previous) => {
  if (previous.authUser && state.authUser?._id !== previous.authUser._id) {
    useFriendsStore.getState().reset();
  }
  if (state.socket !== previous.socket) {
    if (state.socket) {
      useFriendsStore.getState().bindSocket(state.socket);
    } else {
      useFriendsStore.getState().unbindSocket?.();
      useFriendsStore.setState({ boundSocket: null, unbindSocket: null });
    }
  }
});

// A restored session may have connected while this chunk was downloading.
const currentSocket = useAuthStore.getState().socket;
if (currentSocket) useFriendsStore.getState().bindSocket(currentSocket);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeAuth();
    useFriendsStore.getState().unbindSocket?.();
  });
}
