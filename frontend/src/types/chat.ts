import type { Contact } from "./auth";
import type { Message } from "./message";

export interface ChatStore {
  allContacts: Contact[];
  chats: Contact[];
  unreadCounts: Record<string, number>;
  messages: Message[];
  activeTab: "chats" | "contacts";
  selectedUser: Contact | null;
  isUsersLoading: boolean;
  isMessagesLoading: boolean;
  socketBound: boolean;
  setActiveTab: (tab: "chats" | "contacts") => void;
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
