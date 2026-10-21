import { useState } from "react";
import { useRelationship } from "@/hooks/useRelationship";
import { useFriendsStore } from "@/store/useFriendsStore";
import type { Contact } from "@/types/auth";
import { rowPrimaryButton } from "./styles";

interface MessagingUnavailableNoticeProps {
  user: Contact;
  reason: "FRIENDS_ONLY" | "UNAVAILABLE";
}

// Takes the message box's place when this person can't be written to.
function MessagingUnavailableNotice({ user, reason }: MessagingUnavailableNoticeProps) {
  const { sendRequest, acceptRequest } = useFriendsStore();
  const { state, request } = useRelationship(user._id);
  const [isBusy, setIsBusy] = useState(false);

  const run = async (action: () => Promise<unknown>) => {
    setIsBusy(true);
    try {
      await action();
    } finally {
      setIsBusy(false);
    }
  };

  const text =
    reason === "FRIENDS_ONLY"
      ? `Only ${user.fullName}'s friends can message them.`
      : `You can't message ${user.fullName}.`;

  return (
    <div className="shrink-0 border-t border-slate-700/50 bg-slate-900/60 p-3 sm:p-4">
      <div
        role="status"
        className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700/70 bg-slate-800/60 px-4 py-2"
      >
        <p className="flex min-h-11 items-center text-sm text-slate-300">{text}</p>
        {reason === "FRIENDS_ONLY" && state === "none" && (
          <button type="button" className={rowPrimaryButton} disabled={isBusy} onClick={() => run(() => sendRequest(user))}>
            Add friend
          </button>
        )}
        {reason === "FRIENDS_ONLY" && state === "incoming" && request && (
          <button type="button" className={rowPrimaryButton} disabled={isBusy} onClick={() => run(() => acceptRequest(request))}>
            Accept request
          </button>
        )}
        {reason === "FRIENDS_ONLY" && state === "outgoing" && (
          <p className="text-sm text-slate-400">Friend request sent</p>
        )}
      </div>
    </div>
  );
}

export default MessagingUnavailableNotice;
