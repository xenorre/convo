import { useChatStore } from "@/store/useChatStore";
import { useEffect, memo, useMemo, useCallback } from "react";
import UsersLoadingSkeleton from "./UsersLoadingSkeleton";
import NoChatsFound from "./NoChatsFound";
import { useAuthStore } from "@/store/useAuthStore";
import type { Contact } from "@/types/auth";

const ChatItem = memo(({ chat, isOnline, onSelect }: {
  chat: Contact;
  isOnline: boolean;
  onSelect: (chat: Contact) => void;
}) => {
  const handleClick = useCallback(() => onSelect(chat), [chat, onSelect]);
  
  return (
    <div
      className="bg-cyan-500/10 p-4 rounded-lg cursor-pointer hover:bg-cyan-500/20 transition-colors"
      onClick={handleClick}
    >
      <div className="flex items-center gap-3">
        <div className={`avatar ${isOnline ? "avatar-online" : "avatar-offline"}`}>
          <div className="size-12 rounded-full">
            <img src={chat.profilePic} alt={chat.fullName} loading="lazy" />
          </div>
        </div>
        <h4 className="text-slate-200 font-medium truncate">
          {chat.fullName}
        </h4>
      </div>
    </div>
  );
});

ChatItem.displayName = 'ChatItem';

function ChatsList() {
  const { getMyChatPartners, chats, isUsersLoading, setSelectedUser } = useChatStore();
  const { onlineUsers } = useAuthStore();

  // Memoize the getMyChatPartners function to prevent unnecessary re-calls
  const getMyChatPartnersStable = useCallback(() => {
    getMyChatPartners();
  }, [getMyChatPartners]);

  useEffect(() => {
    getMyChatPartnersStable();
  }, [getMyChatPartnersStable]);

  // Memoize online status lookup for performance
  const onlineUsersSet = useMemo(() => new Set(onlineUsers), [onlineUsers]);

  const handleSelectUser = useCallback((chat: Contact) => {
    setSelectedUser(chat);
  }, [setSelectedUser]);

  if (isUsersLoading) {
    return <UsersLoadingSkeleton />;
  }

  // Add safety check to ensure chats is an array
  if (!Array.isArray(chats) || chats.length === 0) {
    return <NoChatsFound />;
  }

  return (
    <>
      {chats.map((chat) => (
        <ChatItem
          key={chat._id}
          chat={chat}
          isOnline={onlineUsersSet.has(chat._id)}
          onSelect={handleSelectUser}
        />
      ))}
    </>
  );
}

export default memo(ChatsList);
