import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import toast from "react-hot-toast";
import { ImageIcon, SendIcon, XIcon } from "lucide-react";
import { validateMessage, sanitizeInput } from "@/utils/sanitize";
import { env } from "@/config/env";
import { getAuthSessionVersion, isCurrentAuthSession } from "@/services/authSession";
import { useTypingSignal } from "@/hooks/useTypingSignal";

// Rendered once per conversation (keyed by it), so unsent text stays with
// the chat it was typed in, including while that chat is minimized.
function MessageInput() {
  const sendMessage = useChatStore((state) => state.sendMessage);
  const setDraft = useChatStore((state) => state.setDraft);
  const userId = useChatStore((state) => state.selectedUser?._id);
  const [text, setText] = useState(() => (userId && useChatStore.getState().drafts[userId]) || "");
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typing = useTypingSignal(userId);
  // The latest text for the cleanup below, which outlives this render.
  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  // Saved when leaving the conversation rather than on every keystroke, and
  // never into the next account's session after a logout.
  useEffect(() => {
    if (!userId) return;
    const sessionVersion = getAuthSessionVersion();
    return () => {
      if (isCurrentAuthSession(sessionVersion)) setDraft(userId, textRef.current);
    };
  }, [userId, setDraft]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedText = text.trim();

    // Validation
    if (!trimmedText && !imagePreview) {
      toast.error("Please enter a message or select an image");
      return;
    }

    if (trimmedText && !validateMessage(trimmedText)) {
      toast.error(
        `Message must be between 1 and ${env.maxMessageLength} characters`,
      );
      return;
    }

    // Sanitize and send
    const sanitizedText = trimmedText ? sanitizeInput(trimmedText) : undefined;

    typing.stop();
    sendMessage({
      text: sanitizedText,
      image: imagePreview,
    });

    setText("");
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // File type validation
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    // File size validation
    if (file.size > env.maxFileSize) {
      toast.error(
        `Image size must be less than ${Math.round(env.maxFileSize / 1024 / 1024)}MB`,
      );
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      if (reader.result && typeof reader.result === "string") {
        setImagePreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="shrink-0 border-t border-slate-700/50 bg-slate-900/60 p-3 sm:p-4">
      {imagePreview && (
        <div className="max-w-3xl mx-auto mb-3 flex items-center">
          <div className="relative">
            <img
              src={imagePreview}
              alt="Preview"
              className="w-20 h-20 object-cover rounded-lg border border-slate-700"
            />
            <button
              onClick={removeImage}
              className="absolute -top-2 -right-2 flex size-11 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-slate-200 shadow-lg hover:bg-slate-700"
              type="button"
              aria-label="Remove image"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSendMessage}
        className="mx-auto flex max-w-3xl min-w-0 items-center gap-1.5 rounded-2xl border border-slate-700/70 bg-slate-800/60 p-1.5 transition-colors focus-within:border-cyan-500/60 focus-within:ring-2 focus-within:ring-cyan-500/10 sm:gap-2"
      >
        <input
          type="text"
          value={text}
          onChange={(e) => {
            const value = e.target.value;
            if (value.length <= env.maxMessageLength) {
              setText(value);
              typing.onInput(value);
            }
          }}
          className="min-h-11 min-w-0 flex-1 rounded-xl bg-transparent px-2 py-2 text-base text-slate-200 outline-none placeholder:text-slate-500 focus-visible:outline-none sm:px-3"
          placeholder="Type your message..."
          aria-label="Message"
          aria-describedby={
            text.length > env.maxMessageLength * 0.8
              ? "message-length"
              : undefined
          }
          maxLength={env.maxMessageLength}
        />

        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handleImageChange}
          className="hidden"
        />

        <button
          type="button"
          aria-label="Attach image"
          aria-pressed={Boolean(imagePreview)}
          onClick={() => fileInputRef.current?.click()}
          className={`icon-button ${
            imagePreview ? "bg-cyan-500/10 text-cyan-400" : ""
          }`}
        >
          <ImageIcon className="w-5 h-5" />
        </button>
        <button
          type="submit"
          aria-label="Send message"
          disabled={!text.trim() && !imagePreview}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600 to-cyan-700 text-white shadow-sm shadow-cyan-950/30 transition-colors hover:from-cyan-700 hover:to-cyan-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SendIcon className="w-5 h-5" />
        </button>
      </form>
      {text.length > env.maxMessageLength * 0.8 && (
        <p
          id="message-length"
          className="mx-auto mt-2 max-w-3xl text-right text-xs text-slate-400"
        >
          {text.length}/{env.maxMessageLength}
        </p>
      )}
    </div>
  );
}
export default MessageInput;
