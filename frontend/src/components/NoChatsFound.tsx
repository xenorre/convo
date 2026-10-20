import { useChatStore } from "@/store/useChatStore";
import { MessageCircleIcon } from "lucide-react";

function NoChatsFound() {
  const { setActiveTab } = useChatStore();
  return (
    <div className="flex min-w-0 flex-col items-center justify-center gap-4 px-3 py-10 text-center sm:py-12">
      <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-500/10 shadow-sm">
        <MessageCircleIcon
          className="size-7 text-cyan-400"
          aria-hidden="true"
        />
      </div>
      <div className="max-w-60">
        <h4 className="mb-2 text-sm font-semibold text-slate-200">
          No conversations found
        </h4>
        <p className="text-sm leading-relaxed text-slate-400">
          Start a conversation by choosing someone from your contacts.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setActiveTab("contacts")}
        className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-5 py-2 text-sm font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
      >
        Find Contacts
      </button>
    </div>
  );
}

export default NoChatsFound;
