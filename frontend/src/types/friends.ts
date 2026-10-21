import type { Contact } from "./auth";

export interface Friend extends Contact {
  since: string;
}

export interface FriendRequest {
  friendRequestId: string;
  user: Contact;
  createdAt: string;
}

// How the signed-in user relates to someone else.
export type RelationshipState = "none" | "friends" | "outgoing" | "incoming";

export interface UserSearchResult extends Contact {
  relationship: { state: RelationshipState; friendRequestId?: string };
}

export interface FriendsResponse {
  friends: Friend[];
}

export interface FriendRequestsResponse {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

export type SendFriendRequestResponse =
  | { status: "requested"; request: FriendRequest }
  | { status: "accepted"; friendRequestId: string; friend: Contact };

export interface UserSearchResponse {
  users: UserSearchResult[];
}
