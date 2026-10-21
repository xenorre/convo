import { useState } from "react";
import { useFriendsStore } from "@/store/useFriendsStore";
import type { Contact } from "@/types/auth";
import { rowDangerButton, rowSecondaryButton } from "./styles";

interface BlockConfirmProps {
  user: Contact;
  onDone: () => void;
}

// Blocking also ends the friendship, so it asks once before doing it.
function BlockConfirm({ user, onDone }: BlockConfirmProps) {
  const blockUser = useFriendsStore((state) => state.blockUser);
  const [isBusy, setIsBusy] = useState(false);

  const block = async () => {
    setIsBusy(true);
    const blocked = await blockUser(user);
    setIsBusy(false);
    if (blocked) onDone();
  };

  return (
    <div className="space-y-2">
      <p className="text-xs leading-relaxed text-slate-300">
        Block <span className="font-medium text-slate-100">{user.fullName}</span>? You won't be
        friends anymore, and neither of you can message the other or send friend requests.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={rowDangerButton} disabled={isBusy} onClick={block}>
          {isBusy ? "Blocking…" : `Block ${user.fullName.split(" ")[0]}`}
        </button>
        <button type="button" className={rowSecondaryButton} disabled={isBusy} onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default BlockConfirm;
