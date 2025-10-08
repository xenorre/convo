import { useChatStore } from "@/store/useChatStore";
import { useEffect, memo, useMemo, useCallback } from "react";
import UsersLoadingSkeleton from "./UsersLoadingSkeleton";
import NoChatsFound from "./NoChatsFound";
import { useAuthStore } from "@/store/useAuthStore";
import type { Contact } from "@/types/auth";

const ChatItem = memo(({ chat, isOnline, unread, onSelect }: {
  chat: Contact;
  isOnline: boolean;
  unread: number;
  onSelect: (chat: Contact) => void;
}) => {
  const handleClick = useCallback(() => onSelect(chat), [chat, onSelect]);
  
  return (
    <div
      className="bg-cyan-500/10 p-4 rounded-lg cursor-pointer hover:bg-cyan-500/20 transition-colors"
      onClick={handleClick}
    >
      <div className="flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`avatar ${isOnline ? "avatar-online" : "avatar-offline"}`}>
            <div className="size-12 rounded-full">
              <img src={chat.profilePic} alt={chat.fullName} loading="lazy" />
            </div>
          </div>
          <h4 className="text-slate-200 font-medium truncate">
            {chat.fullName}
          </h4>
        </div>
        {unread > 0 && (
          <span className="ml-2 shrink-0 inline-flex items-center justify-center rounded-full bg-cyan-600 text-white text-xs min-w-6 h-6 px-2">
            {unread}
          </span>
        )}
      </div>
    </div>
  );
});

ChatItem.displayName = 'ChatItem';

function ChatsList() {
  const { getMyChatPartners, chats, unreadCounts, isUsersLoading, setSelectedUser } = useChatStore();
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
          unread={unreadCounts[chat._id] || 0}
          onSelect={handleSelectUser}
        />
      ))}
    </>
  );
}

export default memo(ChatsList);
