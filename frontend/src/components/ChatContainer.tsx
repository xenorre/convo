import { useChatStore } from "@/store/useChatStore";
import ChatHeader from "./ChatHeader";
import NoChatHistoryPlaceholder from "./NoChatHistoryPlaceholder";
import { useAuthStore } from "@/store/useAuthStore";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDownIcon, LoaderCircle } from "lucide-react";
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

// Within this distance of the bottom, new messages scroll into view.
const NEAR_BOTTOM_PX = 160;
// Further than this from the bottom, offer a way back down.
const FAR_FROM_BOTTOM_PX = 600;

const distanceFromBottom = (element: HTMLElement) =>
  element.scrollHeight - element.scrollTop - element.clientHeight;

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
    messagesFor,
    hasMoreMessages,
    isLoadingOlderMessages,
    loadOlderMessages,
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
  const listRef = useRef<HTMLDivElement>(null);
  const olderTriggerRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const [isFarFromBottom, setIsFarFromBottom] = useState(false);
  // A message arrived while the user was reading further up.
  const [hasNewBelow, setHasNewBelow] = useState(false);

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

  const firstMessageId = messages[0]?._id;
  const lastMessage = messages.at(-1);
  const lastMessageId = lastMessage?._id;
  const myId = authUser?._id ? String(authUser._id) : "";
  // "Read 18:42" goes under the newest of my messages they have read.
  const lastReadId = [...messages].reverse().find((msg) => msg.senderId === myId && msg.readAt && !msg.deletedAt)?._id;

  const scrollToBottom = useCallback(
    (smooth: boolean) => {
      const container = messagesRef.current;
      container?.scrollTo({ top: container.scrollHeight, behavior: smooth && !prefersReducedMotion ? "smooth" : "instant" });
    },
    [prefersReducedMotion],
  );

  // What the list looked like after the last change, to tell what changed now.
  const shown = useRef<{ conversation: string | null; first?: string; last?: string; firstTop: number }>({
    conversation: null,
    firstTop: 0,
  });
  // Where the user last was, kept up to date by scrolling (a typing bubble
  // or a late layout change can move the bottom without a new message).
  const isNearBottom = useRef(true);
  // Before paint, so nothing jumps: a conversation opens at its newest
  // message, an older page added above keeps the same messages in view, and a
  // new message is followed only if it is mine or the user was at the bottom.
  // An edit or a deletion changes neither end and leaves the view alone.
  useLayoutEffect(() => {
    const container = messagesRef.current;
    const list = listRef.current;
    if (!container) return;
    const before = shown.current;
    if (messagesFor !== before.conversation || (!before.last && lastMessageId)) {
      container.scrollTop = container.scrollHeight;
      isNearBottom.current = true;
      setHasNewBelow(false);
    } else if (before.first && firstMessageId !== before.first && lastMessageId === before.last) {
      // The list doesn't anchor itself (overflow-anchor: none), so the old
      // first message moved down by exactly what was added above it.
      const index = messages.findIndex((msg) => msg._id === before.first);
      const anchor = list?.children[index] as HTMLElement | undefined;
      if (anchor) container.scrollTop += anchor.offsetTop - before.firstTop;
    } else if (lastMessageId && lastMessageId !== before.last) {
      if (lastMessage?.senderId === myId || isNearBottom.current) scrollToBottom(true);
      else setHasNewBelow(true);
    }
    const first = list?.children[0] as HTMLElement | undefined;
    shown.current = {
      conversation: messagesFor,
      first: firstMessageId,
      last: lastMessageId,
      firstTop: first?.offsetTop ?? 0,
    };
  }, [messagesFor, firstMessageId, lastMessageId, lastMessage?.senderId, messages, myId, scrollToBottom]);

  // Loads the page before the oldest message once its top comes near. Set up
  // again after each page, so a short page that leaves the top in view
  // still leads to the next one.
  useEffect(() => {
    const container = messagesRef.current;
    const trigger = olderTriggerRef.current;
    if (!container || !trigger || !hasMoreMessages || isLoadingOlderMessages || isMessagesLoading) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadOlderMessages();
      },
      { root: container, rootMargin: "400px 0px 0px 0px" },
    );
    observer.observe(trigger);
    return () => observer.disconnect();
  }, [hasMoreMessages, isLoadingOlderMessages, isMessagesLoading, loadOlderMessages, firstMessageId, messagesFor]);

  const onScroll = () => {
    const container = messagesRef.current;
    if (!container) return;
    const distance = distanceFromBottom(container);
    isNearBottom.current = distance < NEAR_BOTTOM_PX;
    setIsFarFromBottom(distance > FAR_FROM_BOTTOM_PX);
    if (isNearBottom.current) setHasNewBelow(false);
  };

  // Brings the typing bubble into view, unless the user scrolled up to read.
  useEffect(() => {
    const container = messagesRef.current;
    if (!isPeerTyping || !container) return;
    const nearBottom = distanceFromBottom(container) < NEAR_BOTTOM_PX;
    if (nearBottom) {
      container.scrollTo({ top: container.scrollHeight, behavior: prefersReducedMotion ? "instant" : "smooth" });
    }
  }, [isPeerTyping, prefersReducedMotion]);

  return (
    <>
      <ChatHeader />
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          ref={messagesRef}
          data-message-list
          onScroll={onScroll}
          className={`min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5 [overflow-anchor:none] sm:px-6 sm:py-6 ${
            hasMinimizedChats ? MINIMIZED_CONVERSATION_SPACE : ""
          }`}
        >
        {messages.length > 0 && !isMessagesLoading && (
          <>
            {/* Out of the flow, so it doesn't move the messages below it. */}
            <div ref={olderTriggerRef} className="relative h-px">
              {isLoadingOlderMessages && (
                <div role="status" className="absolute inset-x-0 top-0 flex justify-center">
                  <LoaderCircle className="size-5 animate-spin text-slate-400" aria-hidden="true" />
                  <span className="sr-only">Loading older messages</span>
                </div>
              )}
            </div>
            {!hasMoreMessages && (
              <p className="mx-auto mb-5 max-w-3xl text-center text-xs text-slate-500 [overflow-wrap:anywhere]">
                This is the start of your conversation with {selectedUser?.fullName || "them"}.
              </p>
            )}
          </>
        )}
        {messages.length > 0 && !isMessagesLoading ? (
          <div ref={listRef} className="mx-auto w-full max-w-3xl space-y-4 sm:space-y-5">
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
        {(hasNewBelow || isFarFromBottom) && (
          <button
            type="button"
            onClick={() => {
              setHasNewBelow(false);
              scrollToBottom(true);
            }}
            className="absolute bottom-4 left-1/2 inline-flex min-h-11 -translate-x-1/2 cursor-pointer items-center gap-2 rounded-full border border-cyan-400/25 bg-slate-900/95 px-4 text-sm font-medium text-cyan-300 shadow-lg shadow-slate-950/50 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
          >
            <ArrowDownIcon className="size-4" aria-hidden="true" />
            {hasNewBelow ? "New messages" : "Jump to latest"}
          </button>
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
