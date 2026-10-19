import { Socket } from "socket.io-client";
import type { Message } from "./message";
import type { Contact } from "./auth";

// Define the socket events that our app uses
export interface ServerToClientEvents {
  newMessage: (message: Message | { message: Message; sender?: Contact }) => void;
  getOnlineUsers: (userIds: string[]) => void;
  'session:revoked': (data: { code: string; message: string }) => void;
}

export interface ClientToServerEvents {
  join: (userId: string) => void;
  sendMessage: (data: { text?: string; image?: string; receiverId: string }) => void;
}

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
