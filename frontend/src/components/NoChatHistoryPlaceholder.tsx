import { MessageCircleIcon } from "lucide-react";

const NoChatHistoryPlaceholder = ({ name }: { name: string }) => {
  return (
    <div className="flex min-h-full min-w-0 flex-col items-center justify-center px-4 py-8 text-center sm:p-6">
      <div className="mb-5 flex size-16 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-cyan-500/15 to-cyan-400/5">
        <MessageCircleIcon
          className="size-8 text-cyan-400"
          aria-hidden="true"
        />
      </div>
      <h3 className="mb-3 max-w-md text-lg font-semibold tracking-tight text-slate-200 [overflow-wrap:anywhere]">
        Start your conversation with {name}
      </h3>
      <div className="mb-5 flex max-w-xs flex-col gap-4">
        <p className="text-sm leading-relaxed text-slate-400">
          This is the beginning of your conversation. Send a message to start
          chatting!
        </p>
        <div
          className="mx-auto h-px w-24 bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent"
          aria-hidden="true"
        />
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        <button
          type="button"
          className="min-h-11 cursor-pointer rounded-full border border-cyan-400/15 bg-cyan-500/10 px-4 py-2 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
        >
          👋 Say Hello
        </button>
        <button
          type="button"
          className="min-h-11 cursor-pointer rounded-full border border-cyan-400/15 bg-cyan-500/10 px-4 py-2 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
        >
          🤝 How are you?
        </button>
        <button
          type="button"
          className="min-h-11 cursor-pointer rounded-full border border-cyan-400/15 bg-cyan-500/10 px-4 py-2 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
        >
          📅 Meet up soon?
        </button>
      </div>
    </div>
  );
};

export default NoChatHistoryPlaceholder;
