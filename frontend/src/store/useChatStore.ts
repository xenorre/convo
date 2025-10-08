import { apiService } from "@/services/apiService";
import type { ChatStore } from "@/types/chat";
import toast from "react-hot-toast";
import { create } from "zustand";
import { useAuthStore } from "./useAuthStore";
import type { Message } from "@/types/message";
import { handleStoreError } from "@/utils/errorHandling";
import type { ContactsResponse, ChatsResponse, MessagesResponse } from "@/types/api";

// Normalize messages coming from various sources (REST/socket) to ensure
// senderId/receiverId are plain strings. Some backends may emit populated
// user objects over sockets on initial connections.
const normalizeId = (id: unknown): string => {
  if (id == null) return "";
  if (typeof id === "string") return id;
  // Handle objects like { _id: "..." } or ObjectId-like values
  if (typeof id === "object" && "_id" in (id as Record<string, unknown>)) {
    const value = (id as Record<string, unknown>)._id;
    return typeof value === "string" ? value : String(value);
  }
  try {
    return String(id);
  } catch {
    return "";
  }
};

const normalizeMessage = (msg: any): Message => ({
  _id: normalizeId(msg._id),
  senderId: normalizeId(msg.senderId),
  receiverId: normalizeId(msg.receiverId),
  text: typeof msg.text === "string" ? msg.text : undefined,
  image: typeof msg.image === "string" ? msg.image : undefined,
  createdAt: typeof msg.createdAt === "string" ? msg.createdAt : new Date().toISOString(),
  updatedAt: typeof msg.updatedAt === "string" ? msg.updatedAt : new Date().toISOString(),
});

export const useChatStore = create<ChatStore>((set, get) => ({
  allContacts: [],
  chats: [],
  messages: [],
  activeTab: "chats",
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedUser: (selectedUser) => {
    set({ selectedUser });
  },

  getAllContacts: async () => {
    set({ isUsersLoading: true });
    try {
      const response = await apiService.get<ContactsResponse>("/messages/contacts");
      // Extract users array from API response
      const users = response?.users || [];
      const allContacts = Array.isArray(users) ? users : [];
      set({ allContacts });
    } catch (e) {
      handleStoreError(e, "Failed to load contacts");
      // Set empty array on error to prevent map errors
      set({ allContacts: [] });
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMyChatPartners: async () => {
    set({ isUsersLoading: true });
    try {
      const response = await apiService.get<ChatsResponse>("/messages/chats");
      // Extract chats array from API response
      const chatsData = response?.chats || [];
      const chats = Array.isArray(chatsData) ? chatsData : [];
      set({ chats });
    } catch (e) {
      handleStoreError(e, "Failed to load chat partners");
      // Set empty array on error to prevent map errors
      set({ chats: [] });
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMessagesByUserId: async (userId) => {
    set({ isMessagesLoading: true });
    try {
      const response = await apiService.get<MessagesResponse>(`/messages/${userId}`);
      // Extract messages array from API response
      const messagesData = response?.messages || [];
      const messages = Array.isArray(messagesData) ? messagesData : [];
      set({ messages });
    } catch (e) {
      handleStoreError(e, "Failed to load messages");
      // Set empty array on error to prevent map errors
      set({ messages: [] });
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  sendMessage: async (messageData) => {
    const { selectedUser, messages } = get();
    const { authUser } = useAuthStore.getState();

    if (!selectedUser || !authUser) {
      toast.error("No user selected");
      return;
    }

    const tempId = `temp-${Date.now()}`;

    // Optimistic message
    const optimisticMessage = {
      _id: tempId,
      senderId: authUser._id,
      receiverId: selectedUser._id,
      text: messageData.text || "",
      image: messageData.image || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Add optimistic message immediately
    set({ messages: [...messages, optimisticMessage] });

    try {
      let res;

      if (messageData.image) {
        // Convert base64 to File object for FormData
        const formData = new FormData();

        if (messageData.text) {
          formData.append("text", messageData.text);
        }

        // Convert base64 to blob
        const response = await fetch(messageData.image);
        const blob = await response.blob();

        // Create file from blob
        const file = new File([blob], "image.jpg", {
          type: blob.type || "image/jpeg",
        });
        formData.append("messageFile", file);

        res = await apiService.uploadFile(
          `/messages/send/${selectedUser._id}`,
          file
        );
      } else {
        // Text only - use JSON
        res = await apiService.post(`/messages/send/${selectedUser._id}`, {
          text: messageData.text,
        });
      }

      // Handle different API response structures
      const messageFromAPI = (res && typeof res === 'object' && 'message' in res) 
        ? (res as { message: unknown }).message 
        : res;

      // Normalize and replace optimistic message with real message from API
      const normalized = normalizeMessage(messageFromAPI);
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg._id === tempId ? normalized : msg
        ),
      }));
    } catch (e) {
      handleStoreError(e, "Failed to send message");

      // Remove optimistic message on error
      set((state) => ({
        messages: state.messages.filter((msg) => msg._id !== tempId),
      }));
    }
  },

  subscribeToMessages: () => {
    const { selectedUser } = get();
    if (!selectedUser) return;

    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    socket.on("newMessage", (newMessage: Message | { message: Message } | any) => {
      // Handle wrapped message structure and normalize
      const raw = (newMessage && typeof newMessage === 'object' && 'message' in newMessage)
        ? (newMessage as { message: any }).message
        : newMessage;
      const actualMessage = normalizeMessage(raw);

      const currentMessages = get().messages;

      // Check if message already exists (to avoid duplicates)
      const messageExists = currentMessages.some(
        (msg) => msg._id === actualMessage._id
      );

      if (!messageExists) {
        set({ messages: [...currentMessages, actualMessage] });
      }
    });
  },

  unsubscribeFromMessage: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    socket.off("newMessage");
  },
}));
