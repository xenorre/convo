import { apiService } from "@/services/apiService";
import type { ChatStore, ChatSummary } from "@/types/chat";
import toast from "react-hot-toast";
import { create } from "zustand";
import { useAuthStore } from "./useAuthStore";
import type { Message } from "@/types/message";
import type { Contact } from "@/types/auth";
import { createApiError, handleStoreError } from "@/utils/errorHandling";
import { notifyIncomingMessage } from "@/utils/messageNotifications";
import { isWindowInView } from "@/utils/windowAttention";
import { getAuthSessionVersion, isCurrentAuthSession } from "@/services/authSession";
import type { ChatLastMessage, ChatsResponse, MessagesResponse } from "@/types/api";
import { useFriendsStore } from "./useFriendsStore";

// Normalize messages coming from various sources (REST/socket) to ensure
// senderId/receiverId are plain strings. Some backends may emit populated
// user objects over sockets on initial connections.
const normalizeId = (id: unknown): string => {
  if (id == null) return "";
  if (typeof id === "string") return id;
  // Handle objects like { _id: "..." } or ObjectId-like values
  if (typeof id === "object" && "_id" in (id as Record<string, unknown>)) {
    const value = (id as Record<string, unknown>)._id;
    return typeof value === "string" ? value : String(value);
  }
  try {
    return String(id);
  } catch {
    return "";
  }
};

const normalizeMessage = (msg: any): Message => ({
  _id: normalizeId(msg._id),
  senderId: normalizeId(msg.senderId),
  receiverId: normalizeId(msg.receiverId),
  text: typeof msg.text === "string" ? msg.text : undefined,
  image: typeof msg.image === "string" ? msg.image : undefined,
  createdAt: typeof msg.createdAt === "string" ? msg.createdAt : new Date().toISOString(),
  updatedAt: typeof msg.updatedAt === "string" ? msg.updatedAt : new Date().toISOString(),
});

// Same preview length the server uses for the chat list.
const LAST_MESSAGE_PREVIEW_LENGTH = 120;

// selectedUser stays a plain contact even when it is picked from the chat list.
const toContact = ({ _id, fullName, profilePic }: Contact): Contact => ({ _id, fullName, profilePic });

const toLastMessage = (message: Message): ChatLastMessage => ({
  _id: message._id,
  senderId: message.senderId,
  text: Array.from(message.text ?? "").slice(0, LAST_MESSAGE_PREVIEW_LENGTH).join(""),
  hasAttachment: Boolean(message.image),
  createdAt: message.createdAt,
});

const lastActivity = (chat: ChatSummary) =>
  chat.lastMessage ? Date.parse(chat.lastMessage.createdAt) || 0 : 0;

// Moves the partner's conversation to where its newest message belongs,
// adding it when it is new. A message delivered late never replaces a newer preview.
const withLatestMessage = (chats: ChatSummary[], partner: Contact, message: Message): ChatSummary[] => {
  const partnerId = String(partner._id);
  const existing = chats.find((chat) => String(chat._id) === partnerId);
  const incoming = toLastMessage(message);
  const lastMessage = existing?.lastMessage
    && Date.parse(existing.lastMessage.createdAt) > Date.parse(incoming.createdAt)
    ? existing.lastMessage
    : incoming;
  const updated: ChatSummary = { ...(existing ?? toContact(partner)), lastMessage };

  return [updated, ...chats.filter((chat) => String(chat._id) !== partnerId)]
    .sort((a, b) => lastActivity(b) - lastActivity(a));
};

export const useChatStore = create<ChatStore>((set, get) => ({
  chats: [],
  unreadCounts: {},
  messages: [],
  activeTab: "chats",
  friendsView: "list",
  chatSearchQuery: "",
  selectedUser: null,
  isConversationVisible: false,
  messagingRevision: 0,
  isUsersLoading: false,
  isMessagesLoading: false,
  socketBound: false,
  boundSocket: null,
  unbindSocket: null,

  resetChat: () => {
    get().unbindSocket?.();
    set(useChatStore.getInitialState());
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setFriendsView: (friendsView) => set({ friendsView }),
  setChatSearchQuery: (chatSearchQuery) => set({ chatSearchQuery }),
  setConversationVisible: (isConversationVisible) => set({ isConversationVisible }),

  // The open conversation counts as read only while someone can see it.
  isReadingConversation: (userId) => {
    const { selectedUser, isConversationVisible } = get();
    return isConversationVisible && String(selectedUser?._id) === userId && isWindowInView();
  },

  setSelectedUser: (selectedUser) => {
    set({ selectedUser: selectedUser && toContact(selectedUser) });
  },

  getMyChatPartners: async () => {
    const sessionVersion = getAuthSessionVersion();
    set({ isUsersLoading: true });
    try {
      const response = await apiService.get<ChatsResponse>("/messages/chats");
      if (!isCurrentAuthSession(sessionVersion)) return;
      const chatsData = response?.chats || [];
      const chats = Array.isArray(chatsData) ? chatsData : [];
      const unreadCounts = response?.unreadCounts || {};
      set({ chats, unreadCounts });
    } catch (e) {
      if (!isCurrentAuthSession(sessionVersion)) return;
      handleStoreError(e, "Failed to load chat partners");
      set({ chats: [], unreadCounts: {} });
    } finally {
      if (isCurrentAuthSession(sessionVersion)) set({ isUsersLoading: false });
    }
  },

  getMessagesByUserId: async (userId) => {
    const sessionVersion = getAuthSessionVersion();
    set({ isMessagesLoading: true });
    try {
      const response = await apiService.get<MessagesResponse>(`/messages/${userId}`);
      if (!isCurrentAuthSession(sessionVersion)) return;
      // Extract messages array from API response
      const messagesData = response?.messages || [];
      const messages = Array.isArray(messagesData) ? messagesData : [];
      set({ messages });
    } catch (e) {
      if (!isCurrentAuthSession(sessionVersion)) return;
      handleStoreError(e, "Failed to load messages");
      // Set empty array on error to prevent map errors
      set({ messages: [] });
    } finally {
      if (isCurrentAuthSession(sessionVersion)) set({ isMessagesLoading: false });
    }
  },

  markRead: async (userId) => {
    const sessionVersion = getAuthSessionVersion();
    try {
      await apiService.post(`/messages/mark-read/${userId}`, {});
      if (!isCurrentAuthSession(sessionVersion)) return;
      set((state) => ({
        unreadCounts: { ...state.unreadCounts, [userId]: 0 },
      }));
    } catch (e) {
      // Non-fatal; ignore errors
    }
  },

  sendMessage: async (messageData) => {
    const sessionVersion = getAuthSessionVersion();
    const { selectedUser, messages } = get();
    const { authUser } = useAuthStore.getState();

    if (!selectedUser || !authUser) {
      toast.error("No user selected");
      return;
    }

    const tempId = `temp-${Date.now()}`;

    // Optimistic message
    const optimisticMessage = {
      _id: tempId,
      senderId: authUser._id,
      receiverId: selectedUser._id,
      text: messageData.text || "",
      image: messageData.image || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Add optimistic message immediately
    set({ messages: [...messages, optimisticMessage] });

    try {
      let res;

      if (messageData.image) {
        // Convert base64 data URL to Blob without fetch (CSP-friendly)
        const toBlob = (dataUrl: string) => {
          const [meta, b64] = dataUrl.split(',');
          const mime = /data:(.*?);base64/.exec(meta)?.[1] || 'image/jpeg';
          const binary = atob(b64);
          const len = binary.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
          return new Blob([bytes], { type: mime });
        };
        const blob = toBlob(messageData.image);

        // Create file from blob
        const file = new File([blob], "image.jpg", {
          type: blob.type || "image/jpeg",
        });

        // Prepare additional data for the form
        const additionalData: Record<string, string> = {};
        if (messageData.text) {
          additionalData.text = messageData.text;
        }

        res = await apiService.uploadFile(
          `/messages/send/${selectedUser._id}`,
          file,
          undefined, // no progress callback
          'messageFile', // correct field name expected by backend
          additionalData // include text if provided
        );
      } else {
        // Text only - use JSON
        res = await apiService.post(`/messages/send/${selectedUser._id}`, {
          text: messageData.text,
        });
      }

      if (!isCurrentAuthSession(sessionVersion)) return;

      // Handle different API response structures
      const messageFromAPI = (res && typeof res === 'object' && 'message' in res) 
        ? (res as { message: unknown }).message 
        : res;

      // Normalize and replace optimistic message with real message from API
      const normalized = normalizeMessage(messageFromAPI);
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg._id === tempId ? normalized : msg
        ),
        chats: withLatestMessage(state.chats, selectedUser, normalized),
      }));
    } catch (e) {
      if (!isCurrentAuthSession(sessionVersion)) return;
      const apiError = createApiError(e);
      handleStoreError(e, apiError.status === 403 ? apiError.message : "Failed to send message");
      if (apiError.status === 403) set((state) => ({ messagingRevision: state.messagingRevision + 1 }));

      // Remove optimistic message on error
      set((state) => ({
        messages: state.messages.filter((msg) => msg._id !== tempId),
      }));
    }
  },

  // Bind once to global socket to update unread badges in real time
  bindSocketOnce: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    if (get().boundSocket === socket && get().socketBound) return;
    get().unbindSocket?.();
    const sessionVersion = getAuthSessionVersion();
    const isActiveSocket = () => isCurrentAuthSession(sessionVersion)
      && get().boundSocket === socket && useAuthStore.getState().socket === socket
      && Boolean(useAuthStore.getState().authUser);

    const onMessage = (newMessage: any) => {
      if (!isActiveSocket()) return;
      const raw = (newMessage && typeof newMessage === 'object' && 'message' in newMessage)
        ? newMessage.message
        : newMessage;
      const actualMessage = normalizeMessage(raw);

      const state = get();
      const currentMessages = state.messages;
      const selectedUser = state.selectedUser;
      const chats = state.chats;

      // Move the sender's chat up with this message, adding it from the snapshot (if any) when new
      const senderId = actualMessage.senderId;
      const knownSender = chats.find(chat => String(chat._id) === senderId)
        || useFriendsStore.getState().friends.find(friend => String(friend._id) === senderId);
      const senderSnapshot = newMessage?.sender
        || (typeof raw.senderId === 'object' ? raw.senderId : undefined);
      const sender: Contact = {
        _id: senderId,
        fullName: senderSnapshot?.fullName || knownSender?.fullName || 'New message',
        profilePic: senderSnapshot?.profilePic || knownSender?.profilePic || '',
      };
      const hasChat = chats.some((c) => String(c._id) === senderId);
      if (hasChat || senderSnapshot) {
        set((s) => ({ chats: withLatestMessage(s.chats, sender, actualMessage) }));
      } else {
        // Fallback: refresh chat partners list
        get().getMyChatPartners().catch(() => {});
      }

      // Append to current conversation buffer only if this message is for the open chat
      const messageExists = currentMessages.some((msg) => msg._id === actualMessage._id);
      const isForOpenChat = selectedUser && actualMessage.senderId === String(selectedUser._id);
      if (!messageExists && isForOpenChat) {
        set({ messages: [...currentMessages, actualMessage] });
      }

      // Mark read only if the user is looking at this conversation right now;
      // otherwise count it and alert, even when the chat is open behind another window.
      if (get().isReadingConversation(senderId)) {
        get().markRead(senderId);
      } else {
        set((s) => ({
          unreadCounts: {
            ...s.unreadCounts,
            [senderId]: (s.unreadCounts[senderId] || 0) + 1,
          },
        }));

        const preview = actualMessage.text
          ? (actualMessage.text.length > 60 ? actualMessage.text.slice(0, 57) + '…' : actualMessage.text)
          : 'Sent an attachment';
        notifyIncomingMessage({
          messageId: actualMessage._id,
          senderName: sender.fullName,
          preview,
          onOpen: () => {
            if (!isCurrentAuthSession(sessionVersion)) return;
            const currentState = get();
            const contact = currentState.chats.find(chat => String(chat._id) === senderId)
              || useFriendsStore.getState().friends.find(friend => String(friend._id) === senderId)
              || sender;
            set({ selectedUser: toContact(contact), activeTab: 'chats' });
          },
        });
      }
    };

    // Re-fetch missed messages after reconnect; revoked sockets must never
    // recover buffered packets before the server revalidates their session.
    let hasConnected = socket.connected;
    const onConnect = () => {
      if (!isActiveSocket()) return;
      if (hasConnected) {
        void get().getMyChatPartners();
        const userId = get().selectedUser?._id;
        if (userId) {
          void get().getMessagesByUserId(userId).then(() => {
            if (isActiveSocket() && get().isReadingConversation(userId)) {
              void get().markRead(userId);
            }
          });
        }
      }
      hasConnected = true;
    };

    socket.on("newMessage", onMessage);
    socket.on("connect", onConnect);
    set({
      socketBound: true,
      boundSocket: socket,
      unbindSocket: () => {
        socket.off("newMessage", onMessage);
        socket.off("connect", onConnect);
      },
    });
  },

  // Kept for compatibility; now ensures global binding exists
  subscribeToMessages: () => {
    get().bindSocketOnce();
  },

  unsubscribeFromMessage: () => {
    // No-op: global socket handler remains bound for real-time updates
  },
}));

// This module loads after authentication. Own the session lifecycle here so
// account changes clear private state synchronously, before React can render it.
const unsubscribeAuth = useAuthStore.subscribe((state, previous) => {
  if (previous.authUser && state.authUser?._id !== previous.authUser._id) {
    useChatStore.getState().resetChat();
  }
  if (state.socket !== previous.socket) {
    if (state.socket) {
      useChatStore.getState().bindSocketOnce();
    } else {
      useChatStore.getState().unbindSocket?.();
      useChatStore.setState({ socketBound: false, boundSocket: null, unbindSocket: null });
    }
  }
});

// A restored session may have connected while this chunk was downloading.
if (useAuthStore.getState().socket) useChatStore.getState().bindSocketOnce();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeAuth();
    useChatStore.getState().unbindSocket?.();
  });
}
