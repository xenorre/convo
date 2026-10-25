import type { Message } from "./message";

// API Response types
export interface ApiResponse<T = unknown> {
  data?: T;
  message?: string;
  error?: string;
  requestId: string;
}

export interface AuthResponse {
  message: string;
  user: {
    email: string;
    profilePic: string;
    fullName: string;
    _id: string;
  };
  requestId: string;
}

// Newest message of a conversation, as sent with the chat list.
// `text` is cut to a short preview on the server.
export interface ChatLastMessage {
  _id: string;
  senderId: string;
  text: string;
  hasAttachment: boolean;
  createdAt: string;
  // Deleted for everyone; text is empty.
  deleted?: boolean;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// Returned by the /users profile endpoints.
export interface ProfileResponse {
  message: string;
  user: {
    _id: string;
    email: string;
    fullName: string;
    profilePic: string;
  };
}

export interface ChatsResponse {
  // Ordered by the newest message, most recent first.
  chats: Array<{
    _id: string;
    fullName: string;
    profilePic: string;
    lastMessage: ChatLastMessage;
  }>;
  unreadCounts?: Record<string, number>;
  // Chats muted by this user: peer ID → end of the mute, or null for no end.
  mutes?: Record<string, string | null>;
  requestId: string;
}

export interface MuteChatResponse {
  userId: string;
  mutedUntil: string | null;
  requestId: string;
}

export interface MessageChangeResponse {
  message: Message;
  requestId: string;
}

export interface HideMessageResponse {
  messageId: string;
  peerId: string;
  requestId: string;
}

export interface DeleteChatResponse {
  userId: string;
  // Messages up to this moment are gone for the user who deleted the chat.
  deletedBefore: string;
  requestId: string;
}

export interface MessagesResponse {
  messages: Array<{
    _id: string;
    senderId: string;
    receiverId: string;
    text?: string;
    image?: string;
    createdAt: string;
    updatedAt: string;
  }>;
  requestId: string;
}

export interface MessageSendResponse {
  message: {
    _id: string;
    senderId: string;
    receiverId: string;
    text?: string;
    image?: string;
    createdAt: string;
    updatedAt: string;
  };
  requestId: string;
}
// A sign-in email change waiting for the link sent to the new address.
export interface PendingEmailChange {
  email: string;
  expiresAt: string;
}

export interface EmailSettingsResponse {
  email: string;
  pending: PendingEmailChange | null;
}
