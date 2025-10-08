import { useChatStore } from "@/store/useChatStore";

function ActiveTabSwitch() {
  const { activeTab, setActiveTab } = useChatStore();
  return (
    <div className="tabs tabs-box py-2 flex items-center flex-row bg-transparent">
      <button
        onClick={() => setActiveTab("chats")}
        className={`tab flex-1 mx-2 ${
          activeTab === "chats"
            ? "bg-cyan-500/20 text-cyan-400"
            : "text-slate-400"
        }`}
      >
        Chats
      </button>
      <button
        onClick={() => setActiveTab("contacts")}
        className={`tab flex-1 mx-2 ${
          activeTab === "contacts"
            ? "bg-cyan-500/20 text-cyan-400"
            : "text-slate-400"
        }`}
      >
        Contacts
      </button>
    </div>
  );
}

export default ActiveTabSwitch;
