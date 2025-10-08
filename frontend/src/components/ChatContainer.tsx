import { useChatStore } from "@/store/useChatStore";
import ChatHeader from "./ChatHeader";
import NoChatHistoryPlaceholder from "./NoChatHistoryPlaceholder";
import { useAuthStore } from "@/store/useAuthStore";
import { useEffect, useRef } from "react";
import MessageInput from "./MessageInput";
import MessagesLoadingSkeleton from "./MessagesLoadingSkeleton";

function ChatContainer() {
  const {
    messages,
    selectedUser,
    getMessagesByUserId,
    isMessagesLoading,
    subscribeToMessages,
    unsubscribeFromMessage,
  } = useChatStore();
  const { authUser } = useAuthStore();
  const messageEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedUser && authUser && selectedUser._id) {
      getMessagesByUserId(selectedUser._id.toString());
      subscribeToMessages();
    }

    return () => {
      unsubscribeFromMessage();
    };
  }, [
    selectedUser,
    authUser,
    getMessagesByUserId,
    subscribeToMessages,
    unsubscribeFromMessage,
  ]);

  useEffect(() => {
    if (messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  return (
    <>
      <ChatHeader />
      <div className="flex-1 px-6 overflow-y-auto py-8">
        {messages.length > 0 && !isMessagesLoading ? (
          <div className="max-w-3xl space-y-6">
            {messages.map((msg) => {
              const myId = authUser?._id ? String(authUser._id) : "";
              const isMyMessage = String(msg.senderId) === myId;
              return (
                <div
                  key={msg._id}
                  className={`chat ${isMyMessage ? "chat-end" : "chat-start"}`}
                >
                  <div
                    className={`chat-bubble relative ${
                      isMyMessage
                        ? "bg-cyan-600 text-white"
                        : "bg-slate-800 text-slate-200"
                    }`}
                  >
                    {msg.image && (
                      <img
                        src={msg.image}
                        alt="Shared"
                        className="rounded-lg h-48 object-cover"
                      />
                    )}
                    {msg.text && <p className="mt-2">{msg.text}</p>}
                    <p className="text-xs mt-1 opacity-75 flex items-center gap-1">
                      {msg.createdAt
                        ? new Date(msg.createdAt).toISOString().slice(11, 16)
                        : new Date().toISOString().slice(11, 16)}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messageEndRef} />
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
