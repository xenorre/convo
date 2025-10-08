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

export interface ChatsResponse {
  chats: Array<{
    _id: string;
    fullName: string;
    profilePic: string;
  }>;
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