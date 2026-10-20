import { useChatStore } from "@/store/useChatStore";

function ActiveTabSwitch() {
  const { activeTab, setActiveTab } = useChatStore();
  return (
    <div
      className="mx-4 mt-4 mb-1 flex shrink-0 gap-1 rounded-xl border border-slate-700/50 bg-slate-900/50 p-1"
      role="group"
      aria-label="Conversation views"
    >
      <button
        type="button"
        aria-pressed={activeTab === "chats"}
        onClick={() => setActiveTab("chats")}
        className={`min-h-11 min-w-0 flex-1 cursor-pointer rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${
          activeTab === "chats"
            ? "bg-cyan-500/15 text-cyan-300 shadow-sm ring-1 ring-inset ring-cyan-400/15"
            : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-200"
        }`}
      >
        Chats
      </button>
      <button
        type="button"
        aria-pressed={activeTab === "contacts"}
        onClick={() => setActiveTab("contacts")}
        className={`min-h-11 min-w-0 flex-1 cursor-pointer rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${
          activeTab === "contacts"
            ? "bg-cyan-500/15 text-cyan-300 shadow-sm ring-1 ring-inset ring-cyan-400/15"
            : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-200"
        }`}
      >
        Contacts
      </button>
    </div>
  );
}

export default ActiveTabSwitch;
