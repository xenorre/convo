import { useRef, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import toast from "react-hot-toast";
import { ImageIcon, SendIcon, XIcon } from "lucide-react";
import { validateMessage, sanitizeInput } from "@/utils/sanitize";
import { env } from "@/config/env";

function MessageInput() {
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { sendMessage } = useChatStore();

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedText = text.trim();
    
    // Validation
    if (!trimmedText && !imagePreview) {
      toast.error("Please enter a message or select an image");
      return;
    }
    
    if (trimmedText && !validateMessage(trimmedText)) {
      toast.error(`Message must be between 1 and ${env.maxMessageLength} characters`);
      return;
    }

    // Sanitize and send
    const sanitizedText = trimmedText ? sanitizeInput(trimmedText) : undefined;
    
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
      toast.error(`Image size must be less than ${Math.round(env.maxFileSize / 1024 / 1024)}MB`);
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
    <div className="p-4 border-t border-slate-700/50">
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
              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-slate-200 hover:bg-slate-700"
              type="button"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSendMessage}
        className="max-w-3xl mx-auto flex space-x-4"
      >
        <input
          type="text"
          value={text}
          onChange={(e) => {
            const value = e.target.value;
            if (value.length <= env.maxMessageLength) {
              setText(value);
            }
          }}
          className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-lg py-2 px-4 text-slate-200 placeholder-slate-400 focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          placeholder="Type your message..."
          maxLength={env.maxMessageLength}
        />
        {text.length > env.maxMessageLength * 0.8 && (
          <div className="absolute bottom-16 right-4 text-xs text-slate-400">
            {text.length}/{env.maxMessageLength}
          </div>
        )}

        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handleImageChange}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`bg-slate-800/50 text-slate-400 hover:text-slate-200 rounded-lg px-4 transition-colors ${
            imagePreview ? "text-cyan-500" : ""
          }`}
        >
          <ImageIcon className="w-5 h-5" />
        </button>
        <button
          type="submit"
          disabled={!text.trim() && !imagePreview}
          className="bg-gradient-to-r from-cyan-500 to-cyan-600 text-white rounded-lg px-4 py-2 font-medium hover:from-cyan-600 hover:to-cyan-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <SendIcon className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
}
export default MessageInput;
