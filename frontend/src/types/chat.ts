import type { Contact } from "./auth";
import type { Message, MessageDeleteScope } from "./message";
import type { AppSocket } from "./socket";
import type { ChatLastMessage } from "./api";
import type { MuteDuration } from "@/utils/chatMute";

// A conversation in the chat list. lastMessage is optional so the list still
// renders when a server response does not include it.
export interface ChatSummary extends Contact {
  lastMessage?: ChatLastMessage;
  // Hidden by the user; the next message brings it back.
  hidden?: boolean;
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
  // Bumped when the server refuses a message, so the conversation re-checks
  // whether it can still be written in.
  messagingRevision: number;
  // When each chat deleted in this session was deleted, so a message from
  // before that which arrives late doesn't bring it back.
  deletedChats: Record<string, string>;
  // Chats whose message notifications are off: peer ID → end, or null for no end.
  mutes: Record<string, string | null>;
  // Conversations put aside to come back to, oldest first (at most five).
  minimizedChats: Contact[];
  // Unsent text per conversation, kept while the user is elsewhere.
  drafts: Record<string, string>;
  // People typing to the user right now.
  typingUsers: Record<string, true>;
  isUsersLoading: boolean;
  isMessagesLoading: boolean;
  // Who `messages` belong to; the newest page is loaded first, older ones
  // as the user scrolls up.
  messagesFor: string | null;
  hasMoreMessages: boolean;
  // Where the next older page starts (opaque, from the server).
  messagesCursor: string | null;
  isLoadingOlderMessages: boolean;
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
  // Loads the newest page. For the conversation already shown (after
  // reconnecting, say) it refreshes that page and keeps older ones loaded.
  getMessagesByUserId: (userId: string) => Promise<void>;
  // Adds the page before the oldest loaded message, if there is one.
  loadOlderMessages: () => Promise<void>;
  markRead: (userId: string) => Promise<void>;
  // Deletes the whole history with this person for the current user.
  deleteChat: (user: Contact) => Promise<boolean>;
  muteChat: (user: Contact, duration: MuteDuration) => Promise<boolean>;
  unmuteChat: (user: Contact) => Promise<boolean>;
  hideChat: (user: Contact) => Promise<boolean>;
  unhideChat: (user: Contact) => Promise<boolean>;
  // Puts the open conversation aside; selecting it again restores it.
  minimizeChat: () => void;
  closeMinimizedChat: (userId: string) => void;
  setDraft: (userId: string, text: string) => void;
  // The sender's own messages, within the edit window.
  editMessage: (messageId: string, text: string) => Promise<boolean>;
  deleteMessage: (message: Message, scope: MessageDeleteScope) => Promise<boolean>;
  sendMessage: (messageData: {
    text?: string;
    image?: string | null;
  }) => Promise<void>;
  subscribeToMessages: () => void;
  unsubscribeFromMessage: () => void;
  // Global socket binding
  bindSocketOnce: () => void;
}
