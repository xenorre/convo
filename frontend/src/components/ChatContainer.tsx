import { useChatStore } from "@/store/useChatStore";
import ChatHeader from "./ChatHeader";
import NoChatHistoryPlaceholder from "./NoChatHistoryPlaceholder";
import { useAuthStore } from "@/store/useAuthStore";
import { useEffect, useRef } from "react";
import MessageInput from "./MessageInput";
import MessagesLoadingSkeleton from "./MessagesLoadingSkeleton";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import MessageBubble from "./messages/MessageBubble";
import TypingIndicator from "./messages/TypingIndicator";
import { MINIMIZED_CONVERSATION_SPACE } from "./MinimizedChats";
import { onWindowReturn } from "@/utils/windowAttention";
import { useFriendsStore } from "@/store/useFriendsStore";
import BlockedConversationNotice from "./friends/BlockedConversationNotice";
import MessagingUnavailableNotice from "./friends/MessagingUnavailableNotice";
import { useMessagingPermission } from "@/hooks/useMessagingPermission";

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
  const permission = useMessagingPermission(selectedUser?._id);
  const hasMinimizedChats = useChatStore((state) => state.minimizedChats.length > 0);
  const isPeerTyping = useChatStore((state) =>
    Boolean(state.selectedUser && state.typingUsers[String(state.selectedUser._id)]));
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

  // Follows new messages only; an edit or a deletion further up stays in view.
  const lastMessageId = messages.at(-1)?._id;
  const myId = authUser?._id ? String(authUser._id) : "";
  // "Read 18:42" goes under the newest of my messages they have read.
  const lastReadId = [...messages].reverse().find((msg) => msg.senderId === myId && msg.readAt && !msg.deletedAt)?._id;
  useEffect(() => {
    const container = messagesRef.current;
    container?.scrollTo({
      top: container.scrollHeight,
      behavior: prefersReducedMotion ? "instant" : "smooth",
    });
  }, [lastMessageId, prefersReducedMotion]);

  // Brings the typing bubble into view, unless the user scrolled up to read.
  useEffect(() => {
    const container = messagesRef.current;
    if (!isPeerTyping || !container) return;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 160;
    if (nearBottom) {
      container.scrollTo({ top: container.scrollHeight, behavior: prefersReducedMotion ? "instant" : "smooth" });
    }
  }, [isPeerTyping, prefersReducedMotion]);

  return (
    <>
      <ChatHeader />
      <div
        ref={messagesRef}
        data-message-list
        className={`min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5 sm:px-6 sm:py-6 ${
          hasMinimizedChats ? MINIMIZED_CONVERSATION_SPACE : ""
        }`}
      >
        {messages.length > 0 && !isMessagesLoading ? (
          <div className="mx-auto w-full max-w-3xl space-y-4 sm:space-y-5">
            {messages.map((msg) => (
              <MessageBubble
                key={msg._id}
                message={msg}
                myId={myId}
                peerName={selectedUser?.fullName || "They"}
                showReadTime={msg._id === lastReadId}
              />
            ))}
          </div>
        ) : isMessagesLoading ? (
          <MessagesLoadingSkeleton />
        ) : (
          <NoChatHistoryPlaceholder
            name={selectedUser?.fullName || "Unknown"}
          />
        )}
        {isPeerTyping && !isMessagesLoading && (
          <div className="mx-auto mt-4 w-full max-w-3xl sm:mt-5">
            <TypingIndicator name={selectedUser?.fullName || "They"} />
          </div>
        )}
      </div>
      {selectedUser && isBlocked ? (
        <BlockedConversationNotice user={selectedUser} />
      ) : selectedUser && permission?.canMessage === false ? (
        <MessagingUnavailableNotice user={selectedUser} reason={permission.reason} />
      ) : (
        <MessageInput key={selectedUser?._id} />
      )}
    </>
  );
}

export default ChatContainer;
