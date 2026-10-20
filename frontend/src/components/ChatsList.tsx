import { useChatStore } from "@/store/useChatStore";
import { useEffect, memo, useMemo, useCallback } from "react";
import UsersLoadingSkeleton from "./UsersLoadingSkeleton";
import NoChatsFound from "./NoChatsFound";
import { useAuthStore } from "@/store/useAuthStore";
import type { Contact } from "@/types/auth";
import { UserRoundIcon } from "lucide-react";

const ChatItem = memo(
  ({
    chat,
    isOnline,
    isSelected,
    unread,
    onSelect,
  }: {
    chat: Contact;
    isOnline: boolean;
    isSelected: boolean;
    unread: number;
    onSelect: (chat: Contact) => void;
  }) => {
    const handleClick = useCallback(() => onSelect(chat), [chat, onSelect]);

    return (
      <button
        type="button"
        aria-pressed={isSelected}
        className={`w-full min-w-0 cursor-pointer rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${isSelected ? "border-cyan-400/25 bg-cyan-500/15" : "border-transparent bg-slate-800/30 hover:border-slate-600/40 hover:bg-slate-700/40"}`}
        onClick={handleClick}
      >
        <div className="flex items-center gap-3 justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div
              className={`avatar shrink-0 ${isOnline ? "avatar-online" : "avatar-offline"}`}
            >
              <div className="flex! size-11 items-center justify-center rounded-full bg-slate-700/70 ring-1 ring-slate-600/40">
                {chat.profilePic ? (
                  <img
                    src={chat.profilePic}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRoundIcon
                    className="size-5 text-slate-300"
                    aria-hidden="true"
                  />
                )}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h4
                className="truncate text-sm font-medium text-slate-200"
                title={chat.fullName}
              >
                {chat.fullName}
              </h4>
              <p className="mt-1 text-xs text-slate-400">
                {isOnline ? "Online" : "Offline"}
              </p>
            </div>
          </div>
          {unread > 0 && (
            <span
              aria-label={`${unread} unread messages`}
              className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 px-2 text-xs font-semibold text-cyan-300 ring-1 ring-inset ring-cyan-400/20"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </div>
      </button>
    );
  },
);

ChatItem.displayName = "ChatItem";

function ChatsList() {
  const {
    getMyChatPartners,
    chats,
    unreadCounts,
    isUsersLoading,
    selectedUser,
    setSelectedUser,
  } = useChatStore();
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

  const handleSelectUser = useCallback(
    (chat: Contact) => {
      setSelectedUser(chat);
    },
    [setSelectedUser],
  );

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
          isSelected={selectedUser?._id === chat._id}
          unread={unreadCounts[chat._id] || 0}
          onSelect={handleSelectUser}
        />
      ))}
    </>
  );
}

export default memo(ChatsList);
