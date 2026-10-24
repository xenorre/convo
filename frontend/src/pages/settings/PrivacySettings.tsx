import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import PersonRow from "@/components/friends/PersonRow";
import { rowSecondaryButton } from "@/components/friends/styles";
import ChoiceGroup from "@/components/settings/ChoiceGroup";
import SettingToggle from "@/components/settings/SettingToggle";
import { SettingsCard, SettingsSection } from "@/components/settings/SettingsSection";
import UsersLoadingSkeleton from "@/components/UsersLoadingSkeleton";
import { apiService } from "@/services/apiService";
import { useFriendsStore } from "@/store/useFriendsStore";
import type { BlockedUser, PrivacySettings as Privacy, PrivacySettingsResponse } from "@/types/friends";
import { handleStoreError } from "@/utils/errorHandling";

// Saves each change right away and puts the old value back if that fails.
function usePrivacySettings() {
  const [privacy, setPrivacy] = useState<Privacy | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    apiService
      .get<PrivacySettingsResponse>("/users/settings")
      .then((response) => {
        if (isCurrent) setPrivacy(response.privacy);
      })
      .catch((error) => {
        if (!isCurrent) return;
        setLoadFailed(true);
        handleStoreError(error, "Couldn't load your privacy settings.");
      });
    return () => {
      isCurrent = false;
    };
  }, []);

  const update = async (changes: Partial<Privacy>) => {
    if (!privacy) return;
    const previous = privacy;
    setPrivacy({ ...privacy, ...changes });
    try {
      const response = await apiService.patch<PrivacySettingsResponse>("/users/settings", { privacy: changes });
      setPrivacy(response.privacy);
    } catch (error) {
      setPrivacy(previous);
      handleStoreError(error, "Couldn't save that change. Try again later.");
    }
  };

  return { privacy, loadFailed, update };
}

function BlockedRow({ user }: { user: BlockedUser }) {
  const unblockUser = useFriendsStore((state) => state.unblockUser);
  const [isBusy, setIsBusy] = useState(false);

  const unblock = async () => {
    setIsBusy(true);
    if (!(await unblockUser(user))) setIsBusy(false);
  };

  return (
    <PersonRow avatar={<Avatar src={user.profilePic} />} name={user.fullName} detail="Blocked">
      <button
        type="button"
        className={rowSecondaryButton}
        aria-label={`Unblock ${user.fullName}`}
        disabled={isBusy}
        onClick={unblock}
      >
        Unblock
      </button>
    </PersonRow>
  );
}

function PrivacySettings() {
  const { privacy, loadFailed, update } = usePrivacySettings();
  const { blocked, hasLoaded, loadFriends } = useFriendsStore();

  // Settings can be opened directly, before the chats page loaded friends.
  useEffect(() => {
    if (!useFriendsStore.getState().hasLoaded) void loadFriends();
  }, [loadFriends]);

  return (
    <SettingsSection title="Privacy" description="Who can reach you and see you online">
      {loadFailed ? (
        <SettingsCard title="Settings unavailable">
          <p className="text-sm text-slate-400">Reload the page to try again.</p>
        </SettingsCard>
      ) : !privacy ? (
        <UsersLoadingSkeleton />
      ) : (
        <>
          <SettingsCard
            title="Who can message me"
            description="Friends only means people on your friends list right now; removing someone stops their new messages."
          >
            <ChoiceGroup
              legend="Who can message me"
              name="allowMessagesFrom"
              value={privacy.allowMessagesFrom}
              options={[
                { value: "friends", label: "Friends only" },
                { value: "everyone", label: "Everyone" },
              ]}
              onChange={(value) => update({ allowMessagesFrom: value })}
            />
          </SettingsCard>
          <SettingsCard title="Who can send me friend requests">
            <ChoiceGroup
              legend="Who can send me friend requests"
              name="allowFriendRequestsFrom"
              value={privacy.allowFriendRequestsFrom}
              options={[
                { value: "everyone", label: "Everyone" },
                { value: "nobody", label: "Nobody" },
              ]}
              onChange={(value) => update({ allowFriendRequestsFrom: value })}
            />
          </SettingsCard>
          <SettingsCard title="Online status">
            <SettingToggle
              label="Show when I'm online"
              description="When off, everyone sees you as offline."
              checked={privacy.showOnlineStatus}
              onChange={(value) => update({ showOnlineStatus: value })}
            />
          </SettingsCard>
          <SettingsCard title="Read receipts">
            <SettingToggle
              label="Show when I've read messages"
              description="When off, people won't see when you've read their messages, and you won't see when they've read yours."
              checked={privacy.readReceipts}
              onChange={(value) => update({ readReceipts: value })}
            />
          </SettingsCard>
        </>
      )}

      <SettingsCard
        title="Blocked people"
        description="They can't message you, send you friend requests or find you in search, and you can't reach them."
      >
        {!hasLoaded ? (
          <UsersLoadingSkeleton />
        ) : blocked.length === 0 ? (
          <p className="text-sm text-slate-400">You haven't blocked anyone.</p>
        ) : (
          <div className="space-y-2">
            {blocked.map((user) => (
              <BlockedRow key={user._id} user={user} />
            ))}
          </div>
        )}
      </SettingsCard>
    </SettingsSection>
  );
}

export default PrivacySettings;
