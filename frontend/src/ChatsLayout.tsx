import { useEffect } from "react";
import ActiveTabSwitch from "./components/ActiveTabSwitch";
import ChatContainer from "./components/ChatContainer";
import ChatsList from "./components/ChatsList";
import FriendsPanel from "./components/friends/FriendsPanel";
import NoConversationPlaceholder from "./components/NoConversationPlaceholder";
import ProfileHeader from "./components/ProfileHeader";
import SearchField from "./components/SearchField";
import TwoPanelLayout from "./components/TwoPanelLayout";
import { useChatStore } from "./store/useChatStore";
import { useFriendsStore } from "./store/useFriendsStore";

function ChatsLayout() {
  const { activeTab, selectedUser, chats, chatSearchQuery, setChatSearchQuery } =
    useChatStore();
  const loadFriends = useFriendsStore((state) => state.loadFriends);

  // Loaded up front so the Friends tab can show pending requests right away.
  useEffect(() => {
    if (!useFriendsStore.getState().hasLoaded) void loadFriends();
  }, [loadFriends]);

  return (
    <TwoPanelLayout
      sidebarLabel="Conversations and friends"
      contentLabel="Conversation"
      showContent={Boolean(selectedUser)}
      sidebar={
        <>
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

          {activeTab === "chats" ? (
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 pb-4 pt-2 sm:px-4">
              <ChatsList />
            </div>
          ) : (
            <FriendsPanel />
          )}
        </>
      }
      content={selectedUser ? <ChatContainer /> : <NoConversationPlaceholder />}
    />
  );
}

export default ChatsLayout;
