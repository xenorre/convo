import { Socket } from "socket.io-client";
import type { Message } from "./message";
import type { Contact } from "./auth";
import type { FriendRequest } from "./friends";

// Define the socket events that our app uses
export interface ServerToClientEvents {
  newMessage: (message: Message | { message: Message; sender?: Contact }) => void;
  getOnlineUsers: (userIds: string[]) => void;
  'session:revoked': (data: { code: string; message: string }) => void;
  'friend:request': (data: { request: FriendRequest }) => void;
  'friend:accepted': (data: { friendRequestId: string; friend: Contact }) => void;
  'friend:request:removed': (data: { friendRequestId: string }) => void;
  'friend:removed': (data: { userId: string }) => void;
  'chat:deleted': (data: { userId: string; deletedBefore: string }) => void;
  'chat:muted': (data: { userId: string; mutedUntil: string | null }) => void;
  'chat:unmuted': (data: { userId: string }) => void;
  'chat:hidden': (data: { userId: string; hiddenAt: string }) => void;
  'chat:unhidden': (data: { userId: string }) => void;
  'message:updated': (data: { message: Message }) => void;
  'message:deleted': (data: { message: Message; wasUnread: boolean }) => void;
  'message:hidden': (data: { messageId: string; peerId: string }) => void;
  typing: (data: { userId: string; isTyping: boolean }) => void;
  'messages:read': (data: { readerId: string; readAt: string }) => void;
  'account:deleted': (data: { userId: string }) => void;
  'account:email-changed': (data: { email: string }) => void;
}

export interface ClientToServerEvents {
  join: (userId: string) => void;
  sendMessage: (data: { text?: string; image?: string; receiverId: string }) => void;
  typing: (data: { to: string; isTyping: boolean }) => void;
}

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
