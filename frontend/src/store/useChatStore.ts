import { apiService } from "@/services/apiService";
import type { ChatStore, ChatSummary } from "@/types/chat";
import toast from "react-hot-toast";
import { create } from "zustand";
import { useAuthStore } from "./useAuthStore";
import type { Message } from "@/types/message";
import type { Contact } from "@/types/auth";
import type { ServerToClientEvents } from "@/types/socket";
import { createApiError, handleStoreError } from "@/utils/errorHandling";
import { notifyIncomingMessage } from "@/utils/messageNotifications";
import { isWindowInView } from "@/utils/windowAttention";
import { getAuthSessionVersion, isCurrentAuthSession } from "@/services/authSession";
import type {
  ChatLastMessage,
  ChatsResponse,
  DeleteChatResponse,
  HideMessageResponse,
  MuteChatResponse,
  MessageChangeResponse,
  MessagesResponse,
} from "@/types/api";
import { useFriendsStore } from "./useFriendsStore";
import { isChatMuted } from "@/utils/chatMute";
import { isPendingMessage } from "@/utils/messageEditing";

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

// Any message-shaped payload; fields are checked before use.
type RawMessage = Partial<Record<keyof Message, unknown>>;

// Socket payloads sometimes carry the sender populated in place of its id.
const populatedSender = (senderId: unknown): Partial<Contact> | undefined =>
  senderId && typeof senderId === "object" ? (senderId as Partial<Contact>) : undefined;

const normalizeMessage = (msg: RawMessage): Message => ({
  _id: normalizeId(msg._id),
  senderId: normalizeId(msg.senderId),
  receiverId: normalizeId(msg.receiverId),
  text: typeof msg.text === "string" ? msg.text : undefined,
  image: typeof msg.image === "string" ? msg.image : undefined,
  createdAt: typeof msg.createdAt === "string" ? msg.createdAt : new Date().toISOString(),
  updatedAt: typeof msg.updatedAt === "string" ? msg.updatedAt : new Date().toISOString(),
  // Only on messages that were changed, so ordinary ones keep their shape.
  ...(typeof msg.readAt === "string" && { readAt: msg.readAt }),
  ...(typeof msg.editedAt === "string" && { editedAt: msg.editedAt }),
  ...(typeof msg.deletedAt === "string" && { deletedAt: msg.deletedAt }),
});

// Same preview length the server uses for the chat list.
const LAST_MESSAGE_PREVIEW_LENGTH = 120;

// selectedUser stays a plain contact even when it is picked from the chat list.
const toContact = ({ _id, fullName, profilePic, deleted }: Contact): Contact => ({
  _id,
  fullName,
  profilePic,
  ...(deleted && { deleted }),
});

// How someone appears once they deleted their account (as the server says).
const asDeletedAccount = (contact: Contact): Contact => ({
  _id: contact._id,
  fullName: "Deleted account",
  profilePic: "",
  deleted: true,
});

const toLastMessage = (message: Message): ChatLastMessage => ({
  _id: message._id,
  senderId: message.senderId,
  text: Array.from(message.text ?? "").slice(0, LAST_MESSAGE_PREVIEW_LENGTH).join(""),
  hasAttachment: Boolean(message.image),
  createdAt: message.createdAt,
  ...(message.deletedAt && { deleted: true }),
});

const lastActivity = (chat: ChatSummary) =>
  chat.lastMessage ? Date.parse(chat.lastMessage.createdAt) || 0 : 0;

const withHidden = (chat: ChatSummary, hidden: boolean): ChatSummary => {
  const updated = { ...chat };
  if (hidden) updated.hidden = true;
  else delete updated.hidden;
  return updated;
};

// Moves the partner's conversation to where its newest message belongs,
// adding it when it is new. A message delivered late never replaces a newer
// preview; a new one brings a hidden chat back.
const withLatestMessage = (chats: ChatSummary[], partner: Contact, message: Message): ChatSummary[] => {
  const partnerId = String(partner._id);
  const existing = chats.find((chat) => String(chat._id) === partnerId);
  const incoming = toLastMessage(message);
  const isNewest = !existing?.lastMessage
    || Date.parse(existing.lastMessage.createdAt) <= Date.parse(incoming.createdAt);
  const base: ChatSummary = existing ?? toContact(partner);
  const updated: ChatSummary = isNewest
    ? { ...withHidden(base, false), lastMessage: incoming }
    : { ...base, lastMessage: existing!.lastMessage };

  return [updated, ...chats.filter((chat) => String(chat._id) !== partnerId)]
    .sort((a, b) => lastActivity(b) - lastActivity(a));
};

// Takes a deleted chat out of the list and closes it if it is open.
const withoutChat = (state: ChatStore, userId: string, deletedBefore: string): Partial<ChatStore> => {
  const unreadCounts = { ...state.unreadCounts };
  delete unreadCounts[userId];
  const isOpen = String(state.selectedUser?._id) === userId;
  return {
    chats: state.chats.filter((chat) => String(chat._id) !== userId),
    unreadCounts,
    deletedChats: { ...state.deletedChats, [userId]: deletedBefore },
    minimizedChats: state.minimizedChats.filter((chat) => String(chat._id) !== userId),
    drafts: withoutKey(state.drafts, userId),
    ...(isOpen && { selectedUser: null, messages: [] }),
  };
};

// Marks a chat hidden or not; hiding the open one also closes it.
const withHiddenChat = (state: ChatStore, userId: string, hidden: boolean): Partial<ChatStore> => ({
  chats: state.chats.map((chat) => (String(chat._id) === userId ? withHidden(chat, hidden) : chat)),
  ...(hidden && String(state.selectedUser?._id) === userId && { selectedUser: null, messages: [] }),
});

// At most this many conversations wait in the minimized bar.
const MAX_MINIMIZED_CHATS = 5;

// Puts an edited or deleted-for-everyone message in place, in the open
// conversation and in the chat list preview when it is the newest one.
const withChangedMessage = (state: ChatStore, message: Message): Partial<ChatStore> => ({
  messages: state.messages.map((msg) => (msg._id === message._id ? message : msg)),
  chats: state.chats.map((chat) =>
    chat.lastMessage?._id === message._id ? { ...chat, lastMessage: toLastMessage(message) } : chat,
  ),
});

// Takes out a message deleted for this user. When it was the chat's preview,
// the open conversation knows what comes before it; otherwise the list has to
// be fetched again (`refetch`).
const withoutMessage = (state: ChatStore, messageId: string, peerId: string) => {
  const messages = state.messages.filter((msg) => msg._id !== messageId);
  const chat = state.chats.find((c) => String(c._id) === peerId);
  if (chat?.lastMessage?._id !== messageId) return { changes: { messages }, refetch: false };
  if (String(state.selectedUser?._id) !== peerId) return { changes: { messages }, refetch: true };

  const newest = [...messages].reverse().find((msg) => !msg._id.startsWith("temp-"));
  const chats = newest
    ? state.chats.map((c) => (c === chat ? { ...c, lastMessage: toLastMessage(newest) } : c))
    : state.chats.filter((c) => c !== chat);
  return { changes: { messages, chats }, refetch: false };
};

const withoutKey = <T,>(map: Record<string, T>, key: string) => {
  const rest = { ...map };
  delete rest[key];
  return rest;
};
const withoutMute = withoutKey<string | null>;

const changeErrorMessage = (error: unknown, fallback: string) => {
  const apiError = createApiError(error);
  return apiError.status >= 400 && apiError.status < 500 ? apiError.message : fallback;
};

const isDeletedMessage = (deletedChats: Record<string, string>, partnerId: string, message: Message) => {
  const deletedBefore = deletedChats[partnerId];
  return Boolean(deletedBefore) && Date.parse(message.createdAt) <= Date.parse(deletedBefore);
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
  deletedChats: {},
  mutes: {},
  minimizedChats: [],
  drafts: {},
  typingUsers: {},
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

  // Opening a minimized conversation takes it out of the minimized bar.
  setSelectedUser: (selectedUser) => {
    set((state) => ({
      selectedUser: selectedUser && toContact(selectedUser),
      minimizedChats: selectedUser
        ? state.minimizedChats.filter((chat) => chat._id !== selectedUser._id)
        : state.minimizedChats,
    }));
  },

  minimizeChat: () => {
    const { selectedUser } = get();
    if (!selectedUser) return;
    set((state) => ({
      minimizedChats: [
        ...state.minimizedChats.filter((chat) => chat._id !== selectedUser._id),
        toContact(selectedUser),
      ].slice(-MAX_MINIMIZED_CHATS),
      selectedUser: null,
      messages: [],
    }));
  },

  closeMinimizedChat: (userId) =>
    set((state) => ({ minimizedChats: state.minimizedChats.filter((chat) => chat._id !== userId) })),

  setDraft: (userId, text) =>
    set((state) => (text ? { drafts: { ...state.drafts, [userId]: text } } : { drafts: withoutKey(state.drafts, userId) })),

  getMyChatPartners: async () => {
    const sessionVersion = getAuthSessionVersion();
    set({ isUsersLoading: true });
    try {
      const response = await apiService.get<ChatsResponse>("/messages/chats");
      if (!isCurrentAuthSession(sessionVersion)) return;
      const chatsData = response?.chats || [];
      const chats = Array.isArray(chatsData) ? chatsData : [];
      const unreadCounts = response?.unreadCounts || {};
      set({ chats, unreadCounts, mutes: response?.mutes || {} });
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
    } catch {
      // Non-fatal; ignore errors
    }
  },

  deleteChat: async (user) => {
    const sessionVersion = getAuthSessionVersion();
    try {
      const { deletedBefore } = await apiService.delete<DeleteChatResponse>(`/messages/chats/${user._id}`);
      if (!isCurrentAuthSession(sessionVersion)) return false;
      set((state) => withoutChat(state, String(user._id), deletedBefore));
      toast.success(`Deleted your chat with ${user.fullName}`);
      return true;
    } catch (e) {
      if (isCurrentAuthSession(sessionVersion)) {
        const apiError = createApiError(e);
        handleStoreError(e, apiError.status === 429 ? apiError.message : "Couldn't delete the chat. Try again later.");
      }
      return false;
    }
  },

  muteChat: async (user, duration) => {
    const sessionVersion = getAuthSessionVersion();
    try {
      const { mutedUntil } = await apiService.put<MuteChatResponse>(`/messages/chats/${user._id}/mute`, { duration });
      if (!isCurrentAuthSession(sessionVersion)) return false;
      set((state) => ({ mutes: { ...state.mutes, [String(user._id)]: mutedUntil } }));
      toast.success(`Notifications off for ${user.fullName}`);
      return true;
    } catch (e) {
      if (isCurrentAuthSession(sessionVersion)) {
        handleStoreError(e, changeErrorMessage(e, "Couldn't mute the chat. Try again later."));
      }
      return false;
    }
  },

  unmuteChat: async (user) => {
    const sessionVersion = getAuthSessionVersion();
    try {
      await apiService.delete(`/messages/chats/${user._id}/mute`);
      if (!isCurrentAuthSession(sessionVersion)) return false;
      set((state) => ({ mutes: withoutMute(state.mutes, String(user._id)) }));
      toast.success(`Notifications on for ${user.fullName}`);
      return true;
    } catch (e) {
      if (isCurrentAuthSession(sessionVersion)) {
        handleStoreError(e, changeErrorMessage(e, "Couldn't unmute the chat. Try again later."));
      }
      return false;
    }
  },

  hideChat: async (user) => {
    const sessionVersion = getAuthSessionVersion();
    try {
      await apiService.put(`/messages/chats/${user._id}/hide`, {});
      if (!isCurrentAuthSession(sessionVersion)) return false;
      set((state) => withHiddenChat(state, String(user._id), true));
      toast.success(`Hid your chat with ${user.fullName}. It comes back with the next message.`);
      return true;
    } catch (e) {
      if (isCurrentAuthSession(sessionVersion)) {
        handleStoreError(e, changeErrorMessage(e, "Couldn't hide the chat. Try again later."));
      }
      return false;
    }
  },

  unhideChat: async (user) => {
    const sessionVersion = getAuthSessionVersion();
    try {
      await apiService.delete(`/messages/chats/${user._id}/hide`);
      if (!isCurrentAuthSession(sessionVersion)) return false;
      set((state) => withHiddenChat(state, String(user._id), false));
      return true;
    } catch (e) {
      if (isCurrentAuthSession(sessionVersion)) {
        handleStoreError(e, changeErrorMessage(e, "Couldn't unhide the chat. Try again later."));
      }
      return false;
    }
  },

  editMessage: async (messageId, text) => {
    const sessionVersion = getAuthSessionVersion();
    try {
      const { message } = await apiService.patch<MessageChangeResponse>(`/messages/item/${messageId}`, { text });
      if (!isCurrentAuthSession(sessionVersion)) return false;
      set((state) => withChangedMessage(state, normalizeMessage(message)));
      return true;
    } catch (e) {
      if (!isCurrentAuthSession(sessionVersion)) return false;
      handleStoreError(e, changeErrorMessage(e, "Couldn't edit the message. Try again later."));
      // Refused like a new message would be, so the conversation checks again.
      if (createApiError(e).status === 403) set((state) => ({ messagingRevision: state.messagingRevision + 1 }));
      return false;
    }
  },

  deleteMessage: async (message, scope) => {
    const sessionVersion = getAuthSessionVersion();
    try {
      if (scope === "everyone") {
        const response = await apiService.delete<MessageChangeResponse>(`/messages/item/${message._id}?for=everyone`);
        if (!isCurrentAuthSession(sessionVersion)) return false;
        set((state) => withChangedMessage(state, normalizeMessage(response.message)));
      } else {
        const { messageId, peerId } = await apiService.delete<HideMessageResponse>(`/messages/item/${message._id}?for=me`);
        if (!isCurrentAuthSession(sessionVersion)) return false;
        const { changes, refetch } = withoutMessage(get(), messageId, peerId);
        set(changes);
        if (refetch) void get().getMyChatPartners();
      }
      return true;
    } catch (e) {
      if (isCurrentAuthSession(sessionVersion)) {
        handleStoreError(e, changeErrorMessage(e, "Couldn't delete the message. Try again later."));
      }
      return false;
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
      const messageFromAPI = ((res && typeof res === 'object' && 'message' in res)
        ? (res as { message: unknown }).message
        : res) as RawMessage;

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

    const onMessage = (newMessage: Parameters<ServerToClientEvents["newMessage"]>[0]) => {
      if (!isActiveSocket() || !newMessage || typeof newMessage !== 'object') return;
      const raw = 'message' in newMessage ? newMessage.message : newMessage;
      const actualMessage = normalizeMessage(raw);

      // The message they were typing has arrived.
      if (get().typingUsers[actualMessage.senderId]) setTyping(actualMessage.senderId, false);
      const state = get();
      if (isDeletedMessage(state.deletedChats, actualMessage.senderId, actualMessage)) return;
      const currentMessages = state.messages;
      const selectedUser = state.selectedUser;
      const chats = state.chats;

      // Move the sender's chat up with this message, adding it from the snapshot (if any) when new
      const senderId = actualMessage.senderId;
      const knownSender = chats.find(chat => String(chat._id) === senderId)
        || useFriendsStore.getState().friends.find(friend => String(friend._id) === senderId);
      const senderSnapshot = ('sender' in newMessage ? newMessage.sender : undefined)
        || populatedSender(raw.senderId);
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
      // A muted chat still counts, but stays quiet.
      if (get().isReadingConversation(senderId)) {
        get().markRead(senderId);
      } else {
        set((s) => ({
          unreadCounts: {
            ...s.unreadCounts,
            [senderId]: (s.unreadCounts[senderId] || 0) + 1,
          },
        }));
        if (isChatMuted(get().mutes, senderId)) return;

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

    // The same chat deleted in another tab.
    const onChatDeleted = ({ userId, deletedBefore }: { userId: string; deletedBefore: string }) => {
      if (!isActiveSocket()) return;
      set((state) => withoutChat(state, String(userId), deletedBefore));
    };

    const onMessageUpdated = ({ message }: { message: Message }) => {
      if (!isActiveSocket()) return;
      set((state) => withChangedMessage(state, normalizeMessage(message)));
    };

    const onMessageDeleted = ({ message, wasUnread }: { message: Message; wasUnread: boolean }) => {
      if (!isActiveSocket()) return;
      const deleted = normalizeMessage(message);
      set((state) => {
        const changes = withChangedMessage(state, deleted);
        // It was counted as unread here; it no longer waits to be read.
        const myId = String(useAuthStore.getState().authUser?._id);
        const count = state.unreadCounts[deleted.senderId] || 0;
        if (!wasUnread || deleted.receiverId !== myId || count === 0) return changes;
        return { ...changes, unreadCounts: { ...state.unreadCounts, [deleted.senderId]: count - 1 } };
      });
    };

    // They read everything sent to them up to `readAt`.
    const onMessagesRead = ({ readerId, readAt }: { readerId: string; readAt: string }) => {
      if (!isActiveSocket()) return;
      const myId = String(useAuthStore.getState().authUser?._id);
      const readUntil = Date.parse(readAt);
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg.senderId === myId && msg.receiverId === String(readerId) && !msg.readAt
            && !isPendingMessage(msg) && Date.parse(msg.createdAt) <= readUntil
            ? { ...msg, readAt }
            : msg),
      }));
    };

    const onTyping = ({ userId, isTyping }: { userId: string; isTyping: boolean }) => {
      if (!isActiveSocket()) return;
      setTyping(String(userId), isTyping);
    };

    // Muted or unmuted in another tab.
    const onChatMuted = ({ userId, mutedUntil }: { userId: string; mutedUntil: string | null }) => {
      if (!isActiveSocket()) return;
      set((state) => ({ mutes: { ...state.mutes, [String(userId)]: mutedUntil } }));
    };
    const onChatUnmuted = ({ userId }: { userId: string }) => {
      if (!isActiveSocket()) return;
      set((state) => ({ mutes: withoutMute(state.mutes, String(userId)) }));
    };

    // Hidden or unhidden in another tab.
    const onChatHidden = ({ userId }: { userId: string }) => {
      if (!isActiveSocket()) return;
      set((state) => withHiddenChat(state, String(userId), true));
    };
    const onChatUnhidden = ({ userId }: { userId: string }) => {
      if (!isActiveSocket()) return;
      set((state) => withHiddenChat(state, String(userId), false));
    };

    // Someone this user talked to deleted their account. Their messages stay
    // but their files are gone, so what is shown is loaded again.
    const onAccountDeleted = ({ userId }: { userId: string }) => {
      if (!isActiveSocket()) return;
      const id = String(userId);
      const isThem = (contact: Contact) => String(contact._id) === id;
      set((state) => ({
        selectedUser: state.selectedUser && isThem(state.selectedUser) ? asDeletedAccount(state.selectedUser) : state.selectedUser,
        minimizedChats: state.minimizedChats.map((chat) => (isThem(chat) ? asDeletedAccount(chat) : chat)),
        messagingRevision: state.messagingRevision + 1,
      }));
      setTyping(id, false);
      void get().getMyChatPartners();
      if (get().selectedUser && isThem(get().selectedUser!)) void get().getMessagesByUserId(id);
    };

    // Deleted for this user in another tab.
    const onMessageHidden = ({ messageId, peerId }: { messageId: string; peerId: string }) => {
      if (!isActiveSocket()) return;
      const { changes, refetch } = withoutMessage(get(), messageId, String(peerId));
      set(changes);
      if (refetch) void get().getMyChatPartners();
    };

    socket.on("newMessage", onMessage);
    socket.on("connect", onConnect);
    socket.on("chat:deleted", onChatDeleted);
    socket.on("message:updated", onMessageUpdated);
    socket.on("message:deleted", onMessageDeleted);
    socket.on("message:hidden", onMessageHidden);
    socket.on("chat:muted", onChatMuted);
    socket.on("chat:unmuted", onChatUnmuted);
    socket.on("chat:hidden", onChatHidden);
    socket.on("typing", onTyping);
    socket.on("messages:read", onMessagesRead);
    socket.on("chat:unhidden", onChatUnhidden);
    socket.on("account:deleted", onAccountDeleted);
    set({
      socketBound: true,
      boundSocket: socket,
      unbindSocket: () => {
        socket.off("newMessage", onMessage);
        socket.off("connect", onConnect);
        socket.off("chat:deleted", onChatDeleted);
        socket.off("message:updated", onMessageUpdated);
        socket.off("message:deleted", onMessageDeleted);
        socket.off("message:hidden", onMessageHidden);
        socket.off("chat:muted", onChatMuted);
        socket.off("chat:unmuted", onChatUnmuted);
        socket.off("chat:hidden", onChatHidden);
        socket.off("typing", onTyping);
        socket.off("messages:read", onMessagesRead);
        socket.off("chat:unhidden", onChatUnhidden);
        socket.off("account:deleted", onAccountDeleted);
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

// "Typing" lasts until the sender says it stopped, or until it has not been
// repeated for this long (a lost "stop" must not leave it on forever).
const TYPING_EXPIRES_MS = 6000;
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const setTyping = (userId: string, isTyping: boolean) => {
  clearTimeout(typingTimers.get(userId));
  typingTimers.delete(userId);
  const { typingUsers } = useChatStore.getState();
  if (isTyping) {
    typingTimers.set(userId, setTimeout(() => setTyping(userId, false), TYPING_EXPIRES_MS));
    if (!typingUsers[userId]) useChatStore.setState({ typingUsers: { ...typingUsers, [userId]: true } });
  } else if (typingUsers[userId]) {
    useChatStore.setState({ typingUsers: withoutKey(typingUsers, userId) });
  }
};
const clearTyping = () => {
  typingTimers.forEach((timer) => clearTimeout(timer));
  typingTimers.clear();
};

// Timed mutes leave the list when they end, so the chat list and header
// stop showing them without waiting for a reload.
const muteTimers = new Map<string, ReturnType<typeof setTimeout>>();
// setTimeout can't wait longer than about 24.8 days; mutes last at most a day.
const MAX_TIMER_MS = 2 ** 31 - 1;
const scheduleMuteEnds = (mutes: Record<string, string | null>) => {
  muteTimers.forEach((timer) => clearTimeout(timer));
  muteTimers.clear();
  for (const [userId, mutedUntil] of Object.entries(mutes)) {
    if (mutedUntil === null) continue;
    const delay = Math.min(Math.max(Date.parse(mutedUntil) - Date.now(), 0), MAX_TIMER_MS);
    muteTimers.set(userId, setTimeout(() => {
      const current = useChatStore.getState().mutes;
      if (current[userId] === mutedUntil) useChatStore.setState({ mutes: withoutMute(current, userId) });
    }, delay));
  }
};
const unsubscribeMutes = useChatStore.subscribe((state, previous) => {
  if (state.mutes !== previous.mutes) scheduleMuteEnds(state.mutes);
});

// This module loads after authentication. Own the session lifecycle here so
// account changes clear private state synchronously, before React can render it.
const unsubscribeAuth = useAuthStore.subscribe((state, previous) => {
  if (previous.authUser && state.authUser?._id !== previous.authUser._id) {
    clearTyping();
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
    unsubscribeMutes();
    scheduleMuteEnds({});
    useChatStore.getState().unbindSocket?.();
  });
}
