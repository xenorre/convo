import { useState } from "react";
import { useFriendsStore } from "@/store/useFriendsStore";
import type { Contact } from "@/types/auth";
import { rowSecondaryButton } from "./styles";

// Takes the message box's place while this person is blocked.
function BlockedConversationNotice({ user }: { user: Contact }) {
  const unblockUser = useFriendsStore((state) => state.unblockUser);
  const [isBusy, setIsBusy] = useState(false);

  const unblock = async () => {
    setIsBusy(true);
    if (!(await unblockUser(user))) setIsBusy(false);
  };

  return (
    <div className="shrink-0 border-t border-slate-700/50 bg-slate-900/60 p-3 sm:p-4">
      <div
        role="status"
        className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700/70 bg-slate-800/60 px-4 py-2"
      >
        <p className="text-sm text-slate-300">
          You blocked {user.fullName}. Unblock them to send messages.
        </p>
        <button type="button" className={rowSecondaryButton} disabled={isBusy} onClick={unblock}>
          Unblock
        </button>
      </div>
    </div>
  );
}

export default BlockedConversationNotice;
