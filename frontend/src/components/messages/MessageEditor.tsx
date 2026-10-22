import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import toast from "react-hot-toast";
import { useChatStore } from "@/store/useChatStore";
import type { Message } from "@/types/message";
import { sanitizeInput } from "@/utils/sanitize";

interface MessageEditorProps {
  message: Message;
  onDone: () => void;
}

// Edits the text in place. Enter saves, Shift+Enter adds a line, Escape
// cancels without closing the conversation.
function MessageEditor({ message, onDone }: MessageEditorProps) {
  const editMessage = useChatStore((state) => state.editMessage);
  const [text, setText] = useState(message.text ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const hintId = useId();

  useEffect(() => {
    const input = field.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    const next = sanitizeInput(text);
    if (next === (message.text ?? "")) return onDone();
    if (!next && !message.image) {
      toast.error("A message can't be empty. Delete it instead.");
      return;
    }
    setIsSaving(true);
    const saved = await editMessage(message._id, next);
    setIsSaving(false);
    // On failure the toast explains why, and the text stays for another try or Cancel.
    if (saved) onDone();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onDone();
    } else if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void save();
    }
  };

  return (
    <form onSubmit={save} className="space-y-2">
      <textarea
        ref={field}
        value={text}
        maxLength={2000}
        aria-label="Edit message"
        aria-describedby={hintId}
        disabled={isSaving}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        className="block max-h-40 min-h-11 w-full resize-none rounded-lg bg-slate-950/30 px-2.5 py-2 text-sm text-inherit [field-sizing:content] focus-visible:outline-2 focus-visible:outline-cyan-300"
      />
      <div className="flex items-center justify-end gap-2">
        <span id={hintId} className="mr-auto text-[10px] opacity-70">
          Enter to save · Esc to cancel
        </span>
        <button
          type="button"
          onClick={onDone}
          disabled={isSaving}
          className="min-h-9 cursor-pointer rounded-lg px-3 text-xs font-medium hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="min-h-9 cursor-pointer rounded-lg bg-white/15 px-3 text-xs font-semibold hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

export default MessageEditor;
