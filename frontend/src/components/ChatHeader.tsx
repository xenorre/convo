import { ArrowLeftIcon, BellOffIcon, MinusIcon, UserRoundIcon, XIcon } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import ConversationMenu from "./friends/ConversationMenu";
import { describeMute, isChatMuted } from "@/utils/chatMute";

function ChatHeader() {
  const { selectedUser, setSelectedUser, mutes, minimizeChat } = useChatStore();
  const isMuted = selectedUser ? isChatMuted(mutes, String(selectedUser._id)) : false;
  const isTyping = useChatStore((state) => Boolean(selectedUser && state.typingUsers[String(selectedUser._id)]));
  const { onlineUsers } = useAuthStore();

  const isOnline = selectedUser
    ? onlineUsers.includes(selectedUser._id.toString())
    : false;

  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedUser(null);
    };

    window.addEventListener("keydown", handleEscKey);

    // cleanup function
    return () => window.removeEventListener("keydown", handleEscKey);
  }, [setSelectedUser]);

  return (
    <header className="flex min-h-20 shrink-0 items-center gap-2 border-b border-slate-700/50 bg-slate-800/35 px-3 py-3 sm:gap-3 sm:px-6">
      <button
        type="button"
        aria-label="Back to conversations"
        onClick={() => setSelectedUser(null)}
        className="icon-button -ml-1 md:hidden"
      >
        <ArrowLeftIcon className="size-5" aria-hidden="true" />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div
          className={`avatar shrink-0 ${selectedUser?.deleted ? "" : isOnline ? "avatar-online" : "avatar-offline"}`}
        >
          <div className="flex! size-11 items-center justify-center rounded-full bg-slate-700/70 ring-1 ring-white/10 sm:size-12">
            {selectedUser?.profilePic ? (
              <img
                src={selectedUser.profilePic}
                alt={selectedUser?.fullName}
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

        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <h1 className="truncate text-sm font-semibold text-slate-100 sm:text-base">
              {selectedUser?.fullName}
            </h1>
            {isMuted && selectedUser && (
              <BellOffIcon
                className="size-3.5 shrink-0 text-slate-400"
                role="img"
                aria-label={describeMute(mutes[String(selectedUser._id)])}
              >
                <title>{describeMute(mutes[String(selectedUser._id)])}</title>
              </BellOffIcon>
            )}
          </div>
          <p
            className={`mt-0.5 text-xs ${isTyping || isOnline ? "text-cyan-400" : "text-slate-400"}`}
          >
            {selectedUser?.deleted ? "Account deleted" : isTyping ? "typing…" : isOnline ? "Online" : "Offline"}
          </p>
        </div>
      </div>

      {selectedUser && <ConversationMenu user={selectedUser} />}
      <button
        type="button"
        aria-label="Minimize conversation"
        title="Minimize"
        className="icon-button"
        onClick={minimizeChat}
      >
        <MinusIcon className="size-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Close conversation"
        className="icon-button hidden md:inline-flex"
        onClick={() => setSelectedUser(null)}
      >
        <XIcon className="size-5" aria-hidden="true" />
      </button>
    </header>
  );
}
export default ChatHeader;
