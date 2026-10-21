import { useId, useMemo, useState, type ReactNode } from "react";
import { CheckIcon, MoreHorizontalIcon, UserPlusIcon, UsersRoundIcon, XIcon } from "lucide-react";
import Avatar from "@/components/Avatar";
import SearchField from "@/components/SearchField";
import UsersLoadingSkeleton from "@/components/UsersLoadingSkeleton";
import { useAuthStore } from "@/store/useAuthStore";
import { useChatStore } from "@/store/useChatStore";
import { useFriendsStore } from "@/store/useFriendsStore";
import type { Friend, FriendRequest } from "@/types/friends";
import { filterChats } from "@/utils/chatSearch";
import AddFriendPanel from "./AddFriendPanel";
import PersonRow from "./PersonRow";
import BlockConfirm from "./BlockConfirm";
import { iconAction, rowDangerButton, rowPrimaryButton, rowSecondaryButton } from "./styles";

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="px-1 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400 first:pt-1">
      {children}
    </h3>
  );
}

function RequestRow({ request, direction }: { request: FriendRequest; direction: "incoming" | "outgoing" }) {
  const { acceptRequest, declineRequest, cancelRequest } = useFriendsStore();
  const [isBusy, setIsBusy] = useState(false);
  const name = request.user.fullName;
  const run = async (action: () => Promise<boolean>) => {
    setIsBusy(true);
    // The row disappears on success; only a failure needs re-enabling.
    if (!(await action())) setIsBusy(false);
  };

  return (
    <PersonRow
      avatar={<Avatar src={request.user.profilePic} />}
      name={name}
      // Short enough to fit next to two action buttons in the narrow sidebar.
      detail={direction === "incoming" ? "Friend request" : "Request sent"}
    >
      {direction === "incoming" ? (
        <>
          <button
            type="button"
            className={`${iconAction} border border-cyan-400/20 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 hover:text-cyan-200`}
            aria-label={`Accept ${name}'s friend request`}
            disabled={isBusy}
            onClick={() => run(() => acceptRequest(request))}
          >
            <CheckIcon className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={iconAction}
            aria-label={`Decline ${name}'s friend request`}
            disabled={isBusy}
            onClick={() => run(() => declineRequest(request))}
          >
            <XIcon className="size-5" aria-hidden="true" />
          </button>
        </>
      ) : (
        <button
          type="button"
          className={iconAction}
          aria-label={`Cancel friend request to ${name}`}
          disabled={isBusy}
          onClick={() => run(() => cancelRequest(request))}
        >
          <XIcon className="size-5" aria-hidden="true" />
        </button>
      )}
    </PersonRow>
  );
}

function FriendRow({ friend, isOnline }: { friend: Friend; isOnline: boolean }) {
  const { selectedUser, setSelectedUser } = useChatStore();
  const removeFriend = useFriendsStore((state) => state.removeFriend);
  const [actions, setActions] = useState<"closed" | "menu" | "block">("closed");
  const [isRemoving, setIsRemoving] = useState(false);
  const actionsId = useId();
  const isSelected = selectedUser?._id === friend._id;

  const remove = async () => {
    setIsRemoving(true);
    if (!(await removeFriend(friend))) setIsRemoving(false);
  };

  return (
    <div
      className={`min-w-0 rounded-xl border transition-colors ${isSelected ? "border-cyan-400/25 bg-cyan-500/15" : "border-transparent bg-slate-800/30 hover:border-slate-600/40 hover:bg-slate-700/40"}`}
    >
      <div className="flex min-w-0 items-center gap-1 pr-2">
        <button
          type="button"
          aria-pressed={isSelected}
          aria-label={`${friend.fullName}, ${isOnline ? "online" : "offline"}`}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
          onClick={() => setSelectedUser(friend)}
        >
          <Avatar src={friend.profilePic} isOnline={isOnline} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-200" title={friend.fullName}>
              {friend.fullName}
            </span>
            <span className="mt-1 block text-xs text-slate-400">{isOnline ? "Online" : "Offline"}</span>
          </span>
        </button>
        <button
          type="button"
          className={iconAction}
          aria-label={`More actions for ${friend.fullName}`}
          aria-expanded={actions !== "closed"}
          aria-controls={actionsId}
          onClick={() => setActions((open) => (open === "closed" ? "menu" : "closed"))}
        >
          <MoreHorizontalIcon className="size-5" aria-hidden="true" />
        </button>
      </div>
      {actions === "menu" && (
        <div id={actionsId} className="flex flex-wrap gap-2 px-3 pb-3">
          <button type="button" className={rowDangerButton} disabled={isRemoving} onClick={remove}>
            {isRemoving ? "Removing…" : "Remove friend"}
          </button>
          <button type="button" className={rowSecondaryButton} disabled={isRemoving} onClick={() => setActions("block")}>
            Block
          </button>
          <button type="button" className={rowSecondaryButton} onClick={() => setActions("closed")}>
            Cancel
          </button>
        </div>
      )}
      {actions === "block" && (
        <div id={actionsId} className="px-3 pb-3">
          <BlockConfirm user={friend} onDone={() => setActions("closed")} />
        </div>
      )}
    </div>
  );
}

function EmptyFriends({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center gap-4 px-3 py-10 text-center sm:py-12">
      <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-500/10 shadow-sm">
        <UsersRoundIcon className="size-7 text-cyan-400" aria-hidden="true" />
      </div>
      <div className="max-w-60">
        <h4 className="mb-2 text-sm font-semibold text-slate-200">No friends yet</h4>
        <p className="text-sm leading-relaxed text-slate-400">
          Find people by name and send them a friend request.
        </p>
      </div>
      <button type="button" onClick={onAdd} className={`${rowPrimaryButton} px-5`}>
        Add friend
      </button>
    </div>
  );
}

function FriendsPanel() {
  const { friends, incoming, outgoing, hasLoaded, isLoading } = useFriendsStore();
  const onlineUsers = useAuthStore((state) => state.onlineUsers);
  const { friendsView, setFriendsView } = useChatStore();
  const isAdding = friendsView === "add";
  const setIsAdding = (adding: boolean) => setFriendsView(adding ? "add" : "list");
  const [query, setQuery] = useState("");

  const onlineSet = useMemo(() => new Set(onlineUsers), [onlineUsers]);
  const visible = useMemo(() => filterChats(friends, query), [friends, query]);
  const groups = [
    { label: "Online", isOnline: true, members: visible.filter((friend) => onlineSet.has(friend._id)) },
    { label: "Offline", isOnline: false, members: visible.filter((friend) => !onlineSet.has(friend._id)) },
  ];
  const isSearching = query.trim().length > 0;
  const hasRequests = incoming.length + outgoing.length > 0;

  if (isAdding) return <AddFriendPanel onBack={() => setIsAdding(false)} />;

  return (
    <>
      <div className="mx-4 mt-3 flex shrink-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <SearchField value={query} onChange={setQuery} label="Search friends" placeholder="Search friends" />
        </div>
        <button
          type="button"
          aria-label="Add friend"
          title="Add friend"
          onClick={() => setIsAdding(true)}
          className="inline-flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-700/80 bg-slate-900/60 text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
        >
          <UserPlusIcon className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 pb-4 pt-2 sm:px-4">
        {!hasLoaded && isLoading ? (
          <UsersLoadingSkeleton />
        ) : (
          <>
            {hasRequests && !isSearching && (
              <section aria-label="Friend requests" className="space-y-2">
                <SectionHeading>Requests ({incoming.length + outgoing.length})</SectionHeading>
                {incoming.map((request) => (
                  <RequestRow key={request.friendRequestId} request={request} direction="incoming" />
                ))}
                {outgoing.map((request) => (
                  <RequestRow key={request.friendRequestId} request={request} direction="outgoing" />
                ))}
              </section>
            )}

            {friends.length === 0 && !hasRequests && <EmptyFriends onAdd={() => setIsAdding(true)} />}

            {isSearching && visible.length === 0 && friends.length > 0 && (
              <p role="status" className="px-3 py-10 text-center text-sm text-slate-400">
                No friends match <span className="font-medium text-slate-200">“{query.trim()}”</span>
              </p>
            )}

            {groups.map(({ label, isOnline, members }) =>
              members.length > 0 ? (
                <section key={label} aria-label={`${label} friends`} className="space-y-2">
                  <SectionHeading>
                    {label} ({members.length})
                  </SectionHeading>
                  {members.map((friend) => (
                    <FriendRow key={friend._id} friend={friend} isOnline={isOnline} />
                  ))}
                </section>
              ) : null,
            )}
          </>
        )}
      </div>
    </>
  );
}

export default FriendsPanel;
