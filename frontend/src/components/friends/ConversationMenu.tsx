import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeftIcon, MoreHorizontalIcon } from "lucide-react";
import { useRelationship } from "@/hooks/useRelationship";
import { useChatStore } from "@/store/useChatStore";
import { useFriendsStore } from "@/store/useFriendsStore";
import { MUTE_OPTIONS, describeMute, isChatMuted } from "@/utils/chatMute";
import type { Contact } from "@/types/auth";
import DeleteChatDialog from "@/components/DeleteChatDialog";
import BlockConfirm from "./BlockConfirm";

const itemBase =
  "flex min-h-11 w-full cursor-pointer items-center rounded-lg px-3 text-left text-sm transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cyan-400 disabled:cursor-not-allowed disabled:opacity-50";
const itemClass = `${itemBase} text-slate-200`;
const dangerItemClass = `${itemBase} text-red-300`;

// "⋯" in the conversation header: add friend, mute, hide, block or unblock
// this person, or delete the chat.
function ConversationMenu({ user }: { user: Contact }) {
  const { sendRequest, acceptRequest, unblockUser } = useFriendsStore();
  const { state, request } = useRelationship(user._id);
  const { mutes, muteChat, unmuteChat, chats, hideChat, unhideChat } = useChatStore();
  // Only a chat in the list can be hidden from it.
  const chat = chats.find(({ _id }) => String(_id) === String(user._id));
  const isMuted = isChatMuted(mutes, String(user._id));
  const [view, setView] = useState<"closed" | "menu" | "block" | "mute">("closed");
  const [isBusy, setIsBusy] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Closes on a click anywhere else.
  useEffect(() => {
    if (view === "closed") return;
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setView("closed");
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [view]);

  // Escape closes the menu first; only a closed menu lets it close the chat.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && view !== "closed") {
      event.stopPropagation();
      setView("closed");
    }
  };

  const run = async (action: () => Promise<unknown>) => {
    setIsBusy(true);
    try {
      await action();
    } finally {
      setIsBusy(false);
      setView("closed");
    }
  };

  return (
    <div ref={container} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        type="button"
        aria-label={`More actions for ${user.fullName}`}
        aria-expanded={view !== "closed"}
        aria-controls={menuId}
        onClick={() => setView((open) => (open === "closed" ? "menu" : "closed"))}
        className="icon-button cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
      >
        <MoreHorizontalIcon className="size-5" aria-hidden="true" />
      </button>

      {view !== "closed" && (
        <div
          id={menuId}
          className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-slate-700/60 bg-slate-900 p-1 shadow-xl shadow-slate-950/40"
        >
          {view === "block" ? (
            <div className="p-2">
              <BlockConfirm user={user} onDone={() => setView("closed")} />
            </div>
          ) : view === "mute" ? (
            <div role="group" aria-labelledby={`${menuId}-mute`}>
              <div className="flex items-center gap-1 px-1">
                <button
                  type="button"
                  aria-label="Back"
                  className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-400"
                  onClick={() => setView("menu")}
                >
                  <ArrowLeftIcon className="size-4" aria-hidden="true" />
                </button>
                <p id={`${menuId}-mute`} className="text-xs font-medium text-slate-400">
                  Mute message notifications
                </p>
              </div>
              {MUTE_OPTIONS.map(({ duration, label }) => (
                <button
                  key={duration}
                  type="button"
                  className={itemClass}
                  disabled={isBusy}
                  onClick={() => run(() => muteChat(user, duration))}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <>
              {state === "none" && (
                <button type="button" className={itemClass} disabled={isBusy} onClick={() => run(() => sendRequest(user))}>
                  Add friend
                </button>
              )}
              {state === "incoming" && request && (
                <button type="button" className={itemClass} disabled={isBusy} onClick={() => run(() => acceptRequest(request))}>
                  Accept friend request
                </button>
              )}
              {state === "outgoing" && (
                <p className="flex min-h-11 items-center px-3 text-sm text-slate-400">Friend request sent</p>
              )}
              {isMuted ? (
                <button
                  type="button"
                  className={`${itemClass} py-1.5`}
                  disabled={isBusy}
                  onClick={() => run(() => unmuteChat(user))}
                >
                  <span className="flex flex-col">
                    Unmute notifications
                    <span className="text-xs text-slate-400">{describeMute(mutes[String(user._id)])}</span>
                  </span>
                </button>
              ) : (
                <button type="button" className={itemClass} onClick={() => setView("mute")}>
                  Mute notifications
                </button>
              )}
              {chat && (
                <button
                  type="button"
                  className={itemClass}
                  disabled={isBusy}
                  onClick={() => run(() => (chat.hidden ? unhideChat(user) : hideChat(user)))}
                >
                  {chat.hidden ? "Unhide chat" : "Hide chat"}
                </button>
              )}
              {state === "blocked" ? (
                <button type="button" className={itemClass} disabled={isBusy} onClick={() => run(() => unblockUser(user))}>
                  Unblock
                </button>
              ) : (
                <button type="button" className={dangerItemClass} onClick={() => setView("block")}>
                  Block
                </button>
              )}
              <button
                type="button"
                className={dangerItemClass}
                onClick={() => {
                  setView("closed");
                  setIsDeleting(true);
                }}
              >
                Delete chat
              </button>
            </>
          )}
        </div>
      )}

      {isDeleting && (
        <DeleteChatDialog
          user={user}
          onClose={() => {
            setIsDeleting(false);
            trigger.current?.focus();
          }}
        />
      )}
    </div>
  );
}

export default ConversationMenu;
