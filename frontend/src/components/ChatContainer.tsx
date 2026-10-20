import { useChatStore } from "@/store/useChatStore";
import ChatHeader from "./ChatHeader";
import NoChatHistoryPlaceholder from "./NoChatHistoryPlaceholder";
import { useAuthStore } from "@/store/useAuthStore";
import { useEffect, useRef } from "react";
import MessageInput from "./MessageInput";
import MessagesLoadingSkeleton from "./MessagesLoadingSkeleton";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { formatMessageTime } from "@/utils/chatTimestamp";

function ChatContainer() {
  const {
    messages,
    selectedUser,
    getMessagesByUserId,
    markRead,
    isMessagesLoading,
    subscribeToMessages,
    unsubscribeFromMessage,
  } = useChatStore();
  const { authUser } = useAuthStore();
  const messagesRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (selectedUser && authUser && selectedUser._id) {
      getMessagesByUserId(selectedUser._id.toString()).then(() => {
        // Mark read after messages are loaded
        markRead(selectedUser._id.toString());
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
    subscribeToMessages,
    unsubscribeFromMessage,
  ]);

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
      <MessageInput />
    </>
  );
}

export default ChatContainer;
