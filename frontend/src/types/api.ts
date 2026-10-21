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

export interface ContactsResponse {
  users: Array<{
    _id: string;
    fullName: string;
    profilePic: string;
  }>;
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