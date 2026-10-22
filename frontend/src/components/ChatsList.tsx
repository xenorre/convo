import { useChatStore } from "@/store/useChatStore";
import { useEffect, memo, useMemo, useCallback } from "react";
import UsersLoadingSkeleton from "./UsersLoadingSkeleton";
import NoChatsFound from "./NoChatsFound";
import { useAuthStore } from "@/store/useAuthStore";
import type { ChatSummary } from "@/types/chat";
import { PaperclipIcon, UserRoundIcon } from "lucide-react";
import { formatChatTimestamp, formatFullTimestamp } from "@/utils/chatTimestamp";
import { filterChats } from "@/utils/chatSearch";

const NoSearchResults = ({ query, onClear }: { query: string; onClear: () => void }) => (
  <div className="flex min-w-0 flex-col items-center gap-3 px-3 py-10 text-center">
    <p className="max-w-60 break-words text-sm leading-relaxed text-slate-400">
      No chats match <span className="font-medium text-slate-200">“{query.trim()}”</span>
    </p>
    <button
      type="button"
      onClick={onClear}
      className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-5 py-2 text-sm font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
    >
      Clear search
    </button>
  </div>
);

const LastMessagePreview = ({
  lastMessage,
  isMine,
}: {
  lastMessage: NonNullable<ChatSummary["lastMessage"]>;
  isMine: boolean;
}) => {
  if (lastMessage.deleted) {
    return (
      <span className="truncate italic">
        {isMine ? "You deleted a message" : "Message deleted"}
      </span>
    );
  }
  return (
    <>
      {isMine && <span className="shrink-0">You:</span>}
      {lastMessage.hasAttachment && (
        <PaperclipIcon className="size-3.5 shrink-0" aria-label="Attachment" />
      )}
      <span className="truncate">
        {lastMessage.text || (lastMessage.hasAttachment ? "Attachment" : "")}
      </span>
    </>
  );
};

const ChatItem = memo(
  ({
    chat,
    myId,
    isOnline,
    isSelected,
    unread,
    onSelect,
  }: {
    chat: ChatSummary;
    myId: string | undefined;
    isOnline: boolean;
    isSelected: boolean;
    unread: number;
    onSelect: (chat: ChatSummary) => void;
  }) => {
    const handleClick = useCallback(() => onSelect(chat), [chat, onSelect]);
    const { lastMessage } = chat;
    const status = isOnline ? "Online" : "Offline";

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
                {lastMessage && <span className="sr-only"> ({status})</span>}
              </h4>
              <p
                className={`mt-1 flex min-w-0 items-center gap-1 text-xs ${unread > 0 ? "text-slate-300" : "text-slate-400"}`}
              >
                {lastMessage ? (
                  <LastMessagePreview
                    lastMessage={lastMessage}
                    isMine={lastMessage.senderId === myId}
                  />
                ) : (
                  status
                )}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end justify-between gap-1 self-stretch py-0.5">
            {lastMessage && (
              <time
                dateTime={lastMessage.createdAt}
                title={formatFullTimestamp(lastMessage.createdAt)}
                className={`text-xs ${unread > 0 ? "text-cyan-300" : "text-slate-400"}`}
              >
                {formatChatTimestamp(lastMessage.createdAt)}
              </time>
            )}
            {unread > 0 && (
              <span
                aria-label={`${unread} unread messages`}
                className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 px-2 text-xs font-semibold text-cyan-300 ring-1 ring-inset ring-cyan-400/20"
              >
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </div>
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
    chatSearchQuery,
    setChatSearchQuery,
  } = useChatStore();
  const { onlineUsers, authUser } = useAuthStore();

  const visibleChats = useMemo(
    () => (Array.isArray(chats) ? filterChats(chats, chatSearchQuery) : []),
    [chats, chatSearchQuery],
  );
  const isSearching = chatSearchQuery.trim().length > 0;

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
    (chat: ChatSummary) => {
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
      {isSearching && (
        <p role="status" className="sr-only">
          {visibleChats.length === 1 ? "1 chat found" : `${visibleChats.length} chats found`}
        </p>
      )}
      {isSearching && visibleChats.length === 0 && (
        <NoSearchResults query={chatSearchQuery} onClear={() => setChatSearchQuery("")} />
      )}
      {visibleChats.map((chat) => (
        <ChatItem
          key={chat._id}
          chat={chat}
          myId={authUser?._id}
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
