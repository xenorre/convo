import { useState } from "react";
import { useChatStore } from "@/store/useChatStore";
import type { Contact } from "@/types/auth";
import ConfirmDialog from "./ConfirmDialog";

interface DeleteChatDialogProps {
  user: Contact;
  onClose: () => void;
}

// Deleting can't be undone, so it is asked twice: what it does, then that it
// is final.
function DeleteChatDialog({ user, onClose }: DeleteChatDialogProps) {
  const deleteChat = useChatStore((state) => state.deleteChat);
  const [step, setStep] = useState<"ask" | "final">("ask");
  const [isBusy, setIsBusy] = useState(false);

  const confirm = async () => {
    setIsBusy(true);
    const deleted = await deleteChat(user);
    setIsBusy(false);
    if (deleted) onClose();
  };

  return step === "ask" ? (
    <ConfirmDialog
      key="ask"
      title="Delete this chat?"
      actions={[{ label: "Delete chat", onSelect: () => setStep("final") }]}
      onCancel={onClose}
    >
      <p>
        All messages and files in your chat with{" "}
        <span className="font-medium text-slate-100">{user.fullName}</span> will be deleted for you.
      </p>
      <p>{user.fullName} keeps their copy of the conversation.</p>
    </ConfirmDialog>
  ) : (
    <ConfirmDialog
      // A separate dialog, so focus starts on Cancel again rather than the
      // spot where "Delete chat" was just pressed.
      key="final"
      // "Delete forever" opens where "Delete chat" was; a double click must not answer both.
      confirmDelayMs={600}
      title="Delete forever?"
      actions={[{ label: isBusy ? "Deleting…" : "Delete forever", onSelect: confirm }]}
      isBusy={isBusy}
      onCancel={onClose}
    >
      <p>This can't be undone. You won't be able to get these messages back.</p>
    </ConfirmDialog>
  );
}

export default DeleteChatDialog;
