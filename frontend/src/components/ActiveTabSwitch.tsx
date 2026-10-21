import { useChatStore } from "@/store/useChatStore";
import { useFriendsStore } from "@/store/useFriendsStore";

const TABS = [
  { id: "chats", label: "Chats" },
  { id: "friends", label: "Friends" },
] as const;

function ActiveTabSwitch() {
  const { activeTab, setActiveTab } = useChatStore();
  const pendingRequests = useFriendsStore((state) => state.incoming.length);

  return (
    <div
      className="mx-4 mt-4 mb-1 flex shrink-0 gap-1 rounded-xl border border-slate-700/50 bg-slate-900/50 p-1"
      role="group"
      aria-label="Conversation views"
    >
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          aria-pressed={activeTab === id}
          onClick={() => setActiveTab(id)}
          className={`inline-flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${
            activeTab === id
              ? "bg-cyan-500/15 text-cyan-300 shadow-sm ring-1 ring-inset ring-cyan-400/15"
              : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-200"
          }`}
        >
          {label}
          {id === "friends" && pendingRequests > 0 && (
            <span
              aria-label={`${pendingRequests} pending friend requests`}
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-400/15 px-1.5 text-xs font-semibold text-cyan-300 ring-1 ring-inset ring-cyan-400/20"
            >
              {pendingRequests > 99 ? "99+" : pendingRequests}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export default ActiveTabSwitch;
