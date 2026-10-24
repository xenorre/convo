export interface Message {
  _id: string;
  senderId: string;
  receiverId: string;
  text?: string;
  image?: string;
  createdAt: string;
  updatedAt: string;
  // When the receiver read it. For the sender's own messages it is only
  // filled in when both people have read receipts on.
  readAt?: string | null;
  // When the sender last changed the text.
  editedAt?: string | null;
  // When the sender deleted it for everyone; text and image are gone.
  deletedAt?: string | null;
}

export type MessageDeleteScope = "me" | "everyone";
