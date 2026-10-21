import { useFriendsStore } from "@/store/useFriendsStore";
import type { FriendRequest, RelationshipState } from "@/types/friends";

export type LiveRelationship = RelationshipState | "blocked";

// How the signed-in user relates to `userId` right now. The friends store
// follows every change live; `fallback` covers the moment before it loads.
export function useRelationship(userId: string, fallback: RelationshipState = "none") {
  const { friends, incoming, outgoing, blocked, hasLoaded } = useFriendsStore();
  const result = (state: LiveRelationship, request?: FriendRequest) => ({ state, request });

  if (blocked.some(({ _id }) => _id === userId)) return result("blocked");
  if (!hasLoaded) return result(fallback);
  if (friends.some(({ _id }) => _id === userId)) return result("friends");
  const sent = outgoing.find((request) => request.user._id === userId);
  if (sent) return result("outgoing", sent);
  const received = incoming.find((request) => request.user._id === userId);
  if (received) return result("incoming", received);
  return result("none");
}
