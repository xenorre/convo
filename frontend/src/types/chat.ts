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
  allContacts: Contact[];
  chats: ChatSummary[];
  unreadCounts: Record<string, number>;
  messages: Message[];
  activeTab: "chats" | "contacts";
  chatSearchQuery: string;
  selectedUser: Contact | null;
  isUsersLoading: boolean;
  isMessagesLoading: boolean;
  socketBound: boolean;
  boundSocket: AppSocket | null;
  unbindSocket: (() => void) | null;
  resetChat: () => void;
  setActiveTab: (tab: "chats" | "contacts") => void;
  setChatSearchQuery: (query: string) => void;
  setSelectedUser: (user: Contact | null) => void;
  getAllContacts: () => Promise<void>;
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
