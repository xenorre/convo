import { useChatStore } from "@/store/useChatStore";
import ChatHeader from "./ChatHeader";
import NoChatHistoryPlaceholder from "./NoChatHistoryPlaceholder";
import { useAuthStore } from "@/store/useAuthStore";
import { useEffect, useRef } from "react";
import MessageInput from "./MessageInput";
import MessagesLoadingSkeleton from "./MessagesLoadingSkeleton";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { formatMessageTime } from "@/utils/chatTimestamp";
import { onWindowReturn } from "@/utils/windowAttention";
import { useFriendsStore } from "@/store/useFriendsStore";
import BlockedConversationNotice from "./friends/BlockedConversationNotice";

function ChatContainer() {
  const {
    messages,
    selectedUser,
    getMessagesByUserId,
    markRead,
    isMessagesLoading,
    subscribeToMessages,
    unsubscribeFromMessage,
    setConversationVisible,
    isReadingConversation,
  } = useChatStore();
  const { authUser } = useAuthStore();
  const isBlocked = useFriendsStore((state) =>
    state.blocked.some(({ _id }) => _id === selectedUser?._id),
  );
  const messagesRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (selectedUser && authUser && selectedUser._id) {
      const userId = selectedUser._id.toString();
      getMessagesByUserId(userId).then(() => {
        // Mark read after messages are loaded, unless the window is in the background
        if (isReadingConversation(userId)) markRead(userId);
      });
      subscribeToMessages();
    }

    return () => {
      unsubscribeFromMessage();
    };
  }, [
    selectedUser,
    authUser,
    getMessagesByUserId,
    markRead,
    isReadingConversation,
    subscribeToMessages,
    unsubscribeFromMessage,
  ]);

  useEffect(() => {
    setConversationVisible(true);
    return () => setConversationVisible(false);
  }, [setConversationVisible]);

  // Messages that arrived while the window was in the background become read
  // once the user is back on this conversation.
  useEffect(() => {
    const userId = selectedUser?._id;
    if (!userId) return;
    return onWindowReturn(() => {
      if (useChatStore.getState().unreadCounts[userId] && isReadingConversation(userId)) {
        void markRead(userId);
      }
    });
  }, [selectedUser?._id, markRead, isReadingConversation]);

  useEffect(() => {
    const container = messagesRef.current;
    container?.scrollTo({
      top: container.scrollHeight,
      behavior: prefersReducedMotion ? "instant" : "smooth",
    });
  }, [messages, prefersReducedMotion]);

  return (
    <>
      <ChatHeader />
      <div
        ref={messagesRef}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5 sm:px-6 sm:py-6"
      >
        {messages.length > 0 && !isMessagesLoading ? (
          <div className="mx-auto w-full max-w-3xl space-y-4 sm:space-y-5">
            {messages.map((msg) => {
              const myId = authUser?._id ? String(authUser._id) : "";
              const isMyMessage = String(msg.senderId) === myId;
              return (
                <div
                  key={msg._id}
                  className={`chat min-w-0 ${isMyMessage ? "chat-end" : "chat-start"}`}
                >
                  <div
                    className={`chat-bubble relative min-w-0 max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed [overflow-wrap:anywhere] sm:max-w-[80%] ${
                      isMyMessage
                        ? "bg-cyan-700 text-white"
                        : "border border-slate-700/50 bg-slate-800 text-slate-200"
                    }`}
                  >
                    {msg.image && (
                      <img
                        src={msg.image}
                        alt="Shared"
                        className="h-40 max-w-full rounded-xl object-cover sm:h-48"
                      />
                    )}
                    {msg.text && (
                      <p
                        className={`${msg.image ? "mt-2" : ""} whitespace-pre-wrap`}
                      >
                        {msg.text}
                      </p>
                    )}
                    <p className="mt-1.5 text-right text-[10px] leading-none opacity-65">
                      {formatMessageTime(msg.createdAt || new Date())}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : isMessagesLoading ? (
          <MessagesLoadingSkeleton />
        ) : (
          <NoChatHistoryPlaceholder
            name={selectedUser?.fullName || "Unknown"}
          />
        )}
      </div>
      {isBlocked && selectedUser ? <BlockedConversationNotice user={selectedUser} /> : <MessageInput />}
    </>
  );
}

export default ChatContainer;
