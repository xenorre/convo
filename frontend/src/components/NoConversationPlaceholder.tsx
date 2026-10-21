import { MessageCircleIcon } from "lucide-react";

const NoConversationPlaceholder = () => {
  return (
    <div className="flex h-full min-w-0 flex-col items-center justify-center px-6 py-10 text-center sm:px-10">
      <div className="mb-6 flex size-20 shrink-0 items-center justify-center rounded-3xl border border-cyan-400/15 bg-gradient-to-br from-cyan-500/15 to-cyan-400/5 shadow-lg shadow-cyan-950/20">
        <MessageCircleIcon
          className="size-9 text-cyan-400"
          aria-hidden="true"
        />
      </div>
      <h3 className="mb-3 text-xl font-semibold tracking-tight text-slate-100">
        Select a conversation
      </h3>
      <p className="max-w-xs text-sm leading-relaxed text-slate-400">
        Choose a chat or a friend from the sidebar to start chatting or
        continue a previous conversation.
      </p>
    </div>
  );
};

export default NoConversationPlaceholder;
