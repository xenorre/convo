import ActiveTabSwitch from "./components/ActiveTabSwitch";
import BorderAnimatedContainer from "./components/BorderAnimatedContainer";
import ChatContainer from "./components/ChatContainer";
import ChatsList from "./components/ChatsList";
import ContactsList from "./components/ContactsList";
import { ConnectionStatus } from "./components/ConnectionStatus";
import NoConversationPlaceholder from "./components/NoConversationPlaceholder";
import ProfileHeader from "./components/ProfileHeader";
import SearchField from "./components/SearchField";
import { useChatStore } from "./store/useChatStore";

function ChatsLayout() {
  const { activeTab, selectedUser, chats, chatSearchQuery, setChatSearchQuery } =
    useChatStore();

  return (
    <div className="chat-layout relative w-full min-w-0 max-w-6xl">
      <BorderAnimatedContainer>
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
          <ConnectionStatus />
          <div className="flex min-h-0 min-w-0 flex-1">
            <aside
              aria-label="Conversations and contacts"
              className={`${selectedUser ? "hidden md:flex" : "flex"} h-full w-full min-w-0 shrink-0 flex-col bg-slate-800/45 md:w-72 md:border-r md:border-slate-700/50 lg:w-80`}
            >
              <ProfileHeader />
              <ActiveTabSwitch />
              {activeTab === "chats" && chats.length > 0 && (
                <div className="mx-4 mt-3 shrink-0">
                  <SearchField
                    value={chatSearchQuery}
                    onChange={setChatSearchQuery}
                    label="Search chats"
                    placeholder="Search chats"
                  />
                </div>
              )}

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 pb-4 pt-2 sm:px-4">
                {activeTab === "chats" ? <ChatsList /> : <ContactsList />}
              </div>
            </aside>

            <section
              aria-label="Conversation"
              className={`${selectedUser ? "flex" : "hidden md:flex"} h-full min-h-0 min-w-0 flex-1 flex-col bg-slate-900/65`}
            >
              {selectedUser ? <ChatContainer /> : <NoConversationPlaceholder />}
            </section>
          </div>
        </div>
      </BorderAnimatedContainer>
    </div>
  );
}

export default ChatsLayout;
