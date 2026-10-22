import type { Message } from "@/types/message";

// Same window the server enforces.
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

// Still being sent, so the server doesn't know it yet.
export const isPendingMessage = (message: Message) => message._id.startsWith("temp-");

export const canEditMessage = (message: Message, myId: string, now = Date.now()) =>
  message.senderId === myId
  && !message.deletedAt
  && !isPendingMessage(message)
  && now - Date.parse(message.createdAt) < EDIT_WINDOW_MS;
