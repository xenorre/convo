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
  // What their privacy settings allow; the server checks again on use.
  canRequest: boolean;
  canMessage: boolean;
}

export interface BlockedUser extends Contact {
  blockedAt: string;
}

export interface BlockedUsersResponse {
  users: BlockedUser[];
}

export interface BlockResponse {
  status: "blocked";
  endedFriendRequestId: string | null;
}

// Whether a conversation can be written in. A block on their side reads as
// "UNAVAILABLE", just like other reasons the server does not explain.
export type MessagingResponse =
  | { canMessage: true }
  | { canMessage: false; reason: "FRIENDS_ONLY" | "UNAVAILABLE" };

export interface PrivacySettings {
  allowMessagesFrom: "everyone" | "friends";
  allowFriendRequestsFrom: "everyone" | "nobody";
  showOnlineStatus: boolean;
}

export interface PrivacySettingsResponse {
  privacy: PrivacySettings;
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
