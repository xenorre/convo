import { XIcon } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useChatStore } from "@/store/useChatStore";
import { isDefaultAvatar } from "@/utils/avatar";
import { isChatMuted } from "@/utils/chatMute";

// Room the list and the conversation keep free while chats are minimized.
export const MINIMIZED_LIST_SPACE = "max-md:pb-20";
export const MINIMIZED_CONVERSATION_SPACE = "max-md:pb-20 md:pr-20";

// "Anna Kowalska" → "AK"; default avatars all look alike, initials don't.
const initialsOf = (fullName: string) =>
  fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");

// Conversations put aside with "Minimize", as round "chat heads" in the
// bottom-right corner, above the message box when a conversation is open:
// a column beside the conversation from md up, a row along the bottom on
// phones. The list and conversation leave room for them (MINIMIZED_*_SPACE).
// Hovering or focusing one shows its name and a close button; touch screens,
// which can't hover, always show the close button.
function MinimizedChats() {
  const { minimizedChats, unreadCounts, mutes, drafts, selectedUser, setSelectedUser, closeMinimizedChat } =
    useChatStore();
  const onlineUsers = useAuthStore((state) => state.onlineUsers);
  if (minimizedChats.length === 0) return null;

  return (
    <nav
      aria-label="Minimized chats"
      className={`pointer-events-none absolute right-3 z-30 sm:right-5 ${selectedUser ? "bottom-28" : "bottom-4 sm:bottom-5"}`}
    >
      <ul className="flex flex-row-reverse items-end gap-4 md:flex-col md:gap-2">
        {minimizedChats.map((chat) => {
          const unread = unreadCounts[chat._id] || 0;
          const isOnline = onlineUsers.includes(String(chat._id));
          const hasDraft = Boolean(drafts[chat._id]);
          const details = [unread > 0 && `${unread} unread`, hasDraft && "draft"].filter(Boolean).join(", ");
          return (
            <li key={chat._id} className="group pointer-events-auto relative flex items-center">
              {/* The name, beside the bubble on hover or focus. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-full right-0 mb-2 whitespace-nowrap md:bottom-auto md:right-full md:mb-0 md:mr-2 rounded-lg border border-slate-700/60 bg-slate-900/95 px-2.5 py-1 text-xs font-medium text-slate-200 opacity-0 shadow-lg shadow-slate-950/40 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:hidden"
              >
                {chat.fullName}
              </span>

              <button
                type="button"
                title={chat.fullName}
                aria-label={`Open chat with ${chat.fullName}${details ? ` (${details})` : ""}`}
                onClick={() => setSelectedUser(chat)}
                className={`avatar ${isOnline ? "avatar-online" : "avatar-offline"} relative cursor-pointer rounded-full shadow-lg shadow-slate-950/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400`}
              >
                <span className="flex! size-12 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-sm font-semibold text-slate-100 ring-2 ring-slate-900">
                  {!isDefaultAvatar(chat.profilePic) ? (
                    <img src={chat.profilePic} alt="" className="size-full object-cover" />
                  ) : (
                    initialsOf(chat.fullName)
                  )}
                </span>
                {unread > 0 && (
                  <span
                    aria-hidden="true"
                    // Covers the presence dot in the same corner; unread matters more.
                    className={`absolute -right-1 -top-1 z-10 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ring-2 ring-slate-900 ${
                      isChatMuted(mutes, String(chat._id)) ? "bg-slate-600 text-slate-100" : "bg-cyan-500 text-slate-950"
                    }`}
                  >
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
                {hasDraft && (
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-0.5 -left-0.5 inline-flex size-5 items-center justify-center rounded-full bg-slate-800 text-[10px] text-cyan-300 ring-2 ring-slate-900"
                  >
                    ✎
                  </span>
                )}
              </button>

              {/* Shown on hover or focus; touch screens can't hover, so there it stays. */}
              <button
                type="button"
                aria-label={`Close minimized chat with ${chat.fullName}`}
                onClick={() => closeMinimizedChat(chat._id)}
                className="absolute -left-1.5 -top-1.5 inline-flex size-6 cursor-pointer items-center justify-center rounded-full bg-slate-800 text-slate-300 opacity-0 ring-2 ring-slate-900 transition-opacity hover:bg-slate-700 hover:text-slate-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-cyan-400 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
              >
                <XIcon className="size-3" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default MinimizedChats;
