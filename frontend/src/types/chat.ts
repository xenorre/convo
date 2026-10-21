import type { Contact } from "./auth";
import type { Message } from "./message";
import type { AppSocket } from "./socket";
import type { ChatLastMessage } from "./api";

// A conversation in the chat list. lastMessage is optional so the list still
// renders when a server response does not include it.
export interface ChatSummary extends Contact {
  lastMessage?: ChatLastMessage;
}

export interface ChatStore {
  chats: ChatSummary[];
  unreadCounts: Record<string, number>;
  messages: Message[];
  activeTab: "chats" | "friends";
  // The Friends tab shows either the list or the add-friend search.
  friendsView: "list" | "add";
  chatSearchQuery: string;
  selectedUser: Contact | null;
  // Whether the conversation panel is on screen (not e.g. hidden behind Settings).
  isConversationVisible: boolean;
  isUsersLoading: boolean;
  isMessagesLoading: boolean;
  socketBound: boolean;
  boundSocket: AppSocket | null;
  unbindSocket: (() => void) | null;
  resetChat: () => void;
  setActiveTab: (tab: "chats" | "friends") => void;
  setFriendsView: (view: "list" | "add") => void;
  setChatSearchQuery: (query: string) => void;
  setSelectedUser: (user: Contact | null) => void;
  setConversationVisible: (visible: boolean) => void;
  isReadingConversation: (userId: string) => boolean;
  getMyChatPartners: () => Promise<void>;
  getMessagesByUserId: (userId: string) => Promise<void>;
  markRead: (userId: string) => Promise<void>;
  sendMessage: (messageData: {
    text?: string;
    image?: string | null;
  }) => Promise<void>;
  subscribeToMessages: () => void;
  unsubscribeFromMessage: () => void;
  // Global socket binding
  bindSocketOnce: () => void;
}
