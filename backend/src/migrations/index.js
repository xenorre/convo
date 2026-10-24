import { migrateChatPartnersToFriends } from "#services/friend.service.js";
import { markExistingAccountsVerified } from "#services/emailVerification.service.js";

// Data migrations, applied once per database in this order when the server
// starts (see runner.js). Never rename an id: that would run it again.
export const MIGRATIONS = [
  {
    id: "2026-10-friends-from-chat-partners",
    run: () => migrateChatPartnersToFriends(),
  },
  {
    id: "2026-10-confirm-existing-emails",
    run: () => markExistingAccountsVerified(),
  },
];
