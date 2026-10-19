import { apiService } from "@/services/apiService";
import type { ChatStore } from "@/types/chat";
import toast from "react-hot-toast";
import { create } from "zustand";
import { useAuthStore } from "./useAuthStore";
import type { Message } from "@/types/message";
import type { Contact } from "@/types/auth";
import { handleStoreError } from "@/utils/errorHandling";
import { notifyIncomingMessage } from "@/utils/messageNotifications";
import { getAuthSessionVersion, isCurrentAuthSession } from "@/services/authSession";
import type { ContactsResponse, ChatsResponse, MessagesResponse } from "@/types/api";

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

export const useChatStore = create<ChatStore>((set, get) => ({
  allContacts: [],
  chats: [],
  unreadCounts: {},
  messages: [],
  activeTab: "chats",
  selectedUser: null,
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
  setSelectedUser: (selectedUser) => {
    set({ selectedUser });
  },

  getAllContacts: async () => {
    const sessionVersion = getAuthSessionVersion();
    set({ isUsersLoading: true });
    try {
      const response = await apiService.get<ContactsResponse>("/messages/contacts");
      if (!isCurrentAuthSession(sessionVersion)) return;
      // Extract users array from API response
      const users = response?.users || [];
      const allContacts = Array.isArray(users) ? users : [];
      set({ allContacts });
    } catch (e) {
      if (!isCurrentAuthSession(sessionVersion)) return;
      handleStoreError(e, "Failed to load contacts");
      // Set empty array on error to prevent map errors
      set({ allContacts: [] });
    } finally {
      if (isCurrentAuthSession(sessionVersion)) set({ isUsersLoading: false });
    }
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
      }));
    } catch (e) {
      if (!isCurrentAuthSession(sessionVersion)) return;
      handleStoreError(e, "Failed to send message");

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

      // Ensure the sender exists in chats; if not, add using provided snapshot (if any)
      const senderId = actualMessage.senderId;
      const knownSender = chats.find(chat => String(chat._id) === senderId)
        || state.allContacts.find(contact => String(contact._id) === senderId);
      const senderSnapshot = newMessage?.sender
        || (typeof raw.senderId === 'object' ? raw.senderId : undefined);
      const sender: Contact = {
        _id: senderId,
        fullName: senderSnapshot?.fullName || knownSender?.fullName || 'New message',
        profilePic: senderSnapshot?.profilePic || knownSender?.profilePic || '',
      };
      const hasChat = chats.some((c) => String(c._id) === senderId);
      if (!hasChat && senderSnapshot) {
        set({ chats: [sender, ...chats] });
      } else if (!hasChat) {
        // Fallback: refresh chat partners list
        get().getMyChatPartners().catch(() => {});
      }

      // Append to current conversation buffer only if this message is for the open chat
      const messageExists = currentMessages.some((msg) => msg._id === actualMessage._id);
      const isForOpenChat = selectedUser && actualMessage.senderId === String(selectedUser._id);
      if (!messageExists && isForOpenChat) {
        set({ messages: [...currentMessages, actualMessage] });
      }

      // Update unread counts or mark read
      if (isForOpenChat) {
        get().markRead(String(selectedUser._id));
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
              || currentState.allContacts.find(user => String(user._id) === senderId)
              || sender;
            set({ selectedUser: contact, activeTab: 'chats' });
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
            if (isActiveSocket() && get().selectedUser?._id === userId) {
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
