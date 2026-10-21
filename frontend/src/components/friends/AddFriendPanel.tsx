import { useEffect, useState } from "react";
import { ArrowLeftIcon, XIcon } from "lucide-react";
import Avatar from "@/components/Avatar";
import SearchField from "@/components/SearchField";
import UsersLoadingSkeleton from "@/components/UsersLoadingSkeleton";
import { useDebounce } from "@/hooks/useDebounce";
import { apiService } from "@/services/apiService";
import { useChatStore } from "@/store/useChatStore";
import { useFriendsStore } from "@/store/useFriendsStore";
import type { RelationshipState, UserSearchResponse, UserSearchResult } from "@/types/friends";
import { createApiError } from "@/utils/errorHandling";
import PersonRow from "./PersonRow";
import { iconAction, rowPrimaryButton, rowSecondaryButton } from "./styles";

// Same minimum the server enforces.
const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 300;

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; users: UserSearchResult[] };

const RELATIONSHIP_DETAIL: Record<RelationshipState, string> = {
  none: "Not friends yet",
  outgoing: "Request sent",
  incoming: "Wants to be your friend",
  friends: "Already friends",
};

// The friends store follows every change live, so it wins over the
// relationship the server reported when the search ran.
function useRelationship(user: UserSearchResult) {
  const { friends, incoming, outgoing, hasLoaded } = useFriendsStore();
  if (!hasLoaded) return { state: user.relationship.state, request: undefined };
  if (friends.some(({ _id }) => _id === user._id)) return { state: "friends" as const, request: undefined };
  const sent = outgoing.find((request) => request.user._id === user._id);
  if (sent) return { state: "outgoing" as const, request: sent };
  const received = incoming.find((request) => request.user._id === user._id);
  if (received) return { state: "incoming" as const, request: received };
  return { state: "none" as const, request: undefined };
}

function ResultRow({ user }: { user: UserSearchResult }) {
  const { sendRequest, acceptRequest, cancelRequest } = useFriendsStore();
  const setSelectedUser = useChatStore((state) => state.setSelectedUser);
  const { state, request } = useRelationship(user);
  const [isBusy, setIsBusy] = useState(false);

  const run = async (action: () => Promise<unknown>) => {
    setIsBusy(true);
    try {
      await action();
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <PersonRow avatar={<Avatar src={user.profilePic} />} name={user.fullName} detail={RELATIONSHIP_DETAIL[state]}>
      {state === "none" && (
        <button
          type="button"
          className={rowPrimaryButton}
          aria-label={`Add ${user.fullName} as a friend`}
          disabled={isBusy}
          onClick={() => run(() => sendRequest(user))}
        >
          Add
        </button>
      )}
      {state === "outgoing" && request && (
        <button
          type="button"
          className={iconAction}
          aria-label={`Cancel friend request to ${user.fullName}`}
          disabled={isBusy}
          onClick={() => run(() => cancelRequest(request))}
        >
          <XIcon className="size-5" aria-hidden="true" />
        </button>
      )}
      {state === "incoming" && request && (
        <button
          type="button"
          className={rowPrimaryButton}
          aria-label={`Accept ${user.fullName}'s friend request`}
          disabled={isBusy}
          onClick={() => run(() => acceptRequest(request))}
        >
          Accept
        </button>
      )}
      {state === "friends" && (
        <button
          type="button"
          className={rowSecondaryButton}
          aria-label={`Message ${user.fullName}`}
          onClick={() => setSelectedUser(user)}
        >
          Message
        </button>
      )}
    </PersonRow>
  );
}

function AddFriendPanel({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const debounced = useDebounce(query.trim(), DEBOUNCE_MS);

  useEffect(() => {
    if (debounced.length < MIN_QUERY_LENGTH) {
      setSearch({ status: "idle" });
      return;
    }
    // Answers to an older query must not replace newer results.
    let isCurrent = true;
    setSearch({ status: "loading" });
    apiService
      .get<UserSearchResponse>("/users/search", { params: { q: debounced } })
      .then(({ users }) => {
        if (isCurrent) setSearch({ status: "done", users });
      })
      .catch((error) => {
        if (!isCurrent) return;
        const apiError = createApiError(error);
        setSearch({
          status: "error",
          message: apiError.status === 429 ? apiError.message : "Search isn't available right now. Try again later.",
        });
      });
    return () => {
      isCurrent = false;
    };
  }, [debounced]);

  const isTooShort = query.trim().length < MIN_QUERY_LENGTH;

  return (
    <>
      <div className="mx-4 mt-3 flex shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label="Back to friends"
          title="Back to friends"
          onClick={onBack}
          className={`${iconAction} -ml-1`}
        >
          <ArrowLeftIcon className="size-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <SearchField
            value={query}
            onChange={setQuery}
            label="Search people by name"
            placeholder="Search people by name"
            autoFocus
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 pb-4 pt-2 sm:px-4">
        {isTooShort ? (
          <p className="px-3 py-10 text-center text-sm leading-relaxed text-slate-400">
            Type at least {MIN_QUERY_LENGTH} letters of someone's name.
          </p>
        ) : search.status === "loading" || search.status === "idle" ? (
          <UsersLoadingSkeleton />
        ) : search.status === "error" ? (
          <p role="alert" className="px-3 py-10 text-center text-sm text-red-300">
            {search.message}
          </p>
        ) : search.users.length === 0 ? (
          <p role="status" className="px-3 py-10 text-center text-sm text-slate-400">
            No one found for <span className="font-medium text-slate-200">“{debounced}”</span>
          </p>
        ) : (
          <>
            <p role="status" className="sr-only">
              {search.users.length === 1 ? "1 person found" : `${search.users.length} people found`}
            </p>
            {search.users.map((user) => (
              <ResultRow key={user._id} user={user} />
            ))}
          </>
        )}
      </div>
    </>
  );
}

export default AddFriendPanel;
