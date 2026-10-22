import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useChatStore } from "@/store/useChatStore";
import type { Message, MessageDeleteScope } from "@/types/message";

interface DeleteMessageDialogProps {
  message: Message;
  isMine: boolean;
  peerName: string;
  onClose: () => void;
}

// One question with a choice; "for everyone" only for the sender's own
// messages that are not deleted already.
function DeleteMessageDialog({ message, isMine, peerName, onClose }: DeleteMessageDialogProps) {
  const deleteMessage = useChatStore((state) => state.deleteMessage);
  const [busyScope, setBusyScope] = useState<MessageDeleteScope | null>(null);
  const canDeleteForEveryone = isMine && !message.deletedAt;

  const run = async (scope: MessageDeleteScope) => {
    setBusyScope(scope);
    const deleted = await deleteMessage(message, scope);
    setBusyScope(null);
    if (deleted) onClose();
  };

  const label = (scope: MessageDeleteScope, text: string) => (busyScope === scope ? "Deleting…" : text);

  return (
    <ConfirmDialog
      title="Delete message?"
      actions={[
        { label: label("me", "Delete for me"), onSelect: () => run("me") },
        ...(canDeleteForEveryone
          ? [{ label: label("everyone", "Delete for everyone"), onSelect: () => run("everyone") }]
          : []),
      ]}
      isBusy={busyScope !== null}
      onCancel={onClose}
    >
      {message.deletedAt ? (
        <p>The placeholder will be removed from your view.</p>
      ) : canDeleteForEveryone ? (
        <>
          <p>
            <span className="font-medium text-slate-100">Delete for me</span> removes it only from your view.
          </p>
          <p>
            <span className="font-medium text-slate-100">Delete for everyone</span> removes it for you and{" "}
            {peerName}, leaving a note that a message was deleted.
          </p>
        </>
      ) : (
        <p>It will be removed from your view. {peerName} will still see it.</p>
      )}
    </ConfirmDialog>
  );
}

export default DeleteMessageDialog;
