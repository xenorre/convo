import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { MoreVerticalIcon } from "lucide-react";
import type { Message } from "@/types/message";
import { canEditMessage } from "@/utils/messageEditing";
import DeleteMessageDialog from "./DeleteMessageDialog";

interface MessageActionsProps {
  message: Message;
  isMine: boolean;
  myId: string;
  peerName: string;
  onEdit: () => void;
}

const itemClass =
  "flex min-h-11 w-full cursor-pointer items-center rounded-lg px-3 text-left text-sm not-italic transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cyan-400";

// Space the menu needs below its button before it opens upwards instead.
const MENU_SPACE_PX = 128;

// "⋮" beside a message: edit (own messages, for 15 minutes) or delete.
// Shown on hover or focus, and always on touch screens.
function MessageActions({ message, isMine, myId, peerName, onEdit }: MessageActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [opensUp, setOpensUp] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  const toggle = () => {
    if (isOpen) return setIsOpen(false);
    // The edit window is checked when the menu opens, not when the message rendered.
    setCanEdit(canEditMessage(message, myId));
    const button = trigger.current?.getBoundingClientRect();
    const scroller = trigger.current?.closest("[data-message-list]")?.getBoundingClientRect();
    setOpensUp(Boolean(button && scroller && scroller.bottom - button.bottom < MENU_SPACE_PX));
    setIsOpen(true);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && isOpen) {
      event.stopPropagation();
      setIsOpen(false);
      trigger.current?.focus();
    }
  };

  return (
    <div
      ref={container}
      onKeyDown={onKeyDown}
      className={`absolute top-1/2 -translate-y-1/2 ${isMine ? "right-full mr-1" : "left-full ml-1"}`}
    >
      <button
        ref={trigger}
        type="button"
        aria-label="Message actions"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={toggle}
        className={`inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-700/50 hover:text-slate-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-cyan-400 group-hover:opacity-100 [@media(hover:none)]:opacity-100 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
      >
        <MoreVerticalIcon className="size-4" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          id={menuId}
          className={`absolute z-20 w-44 rounded-xl border border-slate-700/60 bg-slate-900 p-1 text-slate-200 shadow-xl shadow-slate-950/40 ${
            opensUp ? "bottom-full mb-1" : "top-full mt-1"
          } ${isMine ? "right-0" : "left-0"}`}
        >
          {canEdit && (
            <button
              type="button"
              className={itemClass}
              onClick={() => {
                setIsOpen(false);
                onEdit();
              }}
            >
              Edit
            </button>
          )}
          <button
            type="button"
            className={`${itemClass} text-red-300`}
            onClick={() => {
              setIsOpen(false);
              setIsDeleting(true);
            }}
          >
            Delete
          </button>
        </div>
      )}

      {isDeleting && (
        <DeleteMessageDialog
          message={message}
          isMine={isMine}
          peerName={peerName}
          onClose={() => {
            setIsDeleting(false);
            trigger.current?.focus();
          }}
        />
      )}
    </div>
  );
}

export default MessageActions;
