import { useEffect, useState } from "react";
import { apiService } from "@/services/apiService";
import { useChatStore } from "@/store/useChatStore";
import type { MessagingResponse } from "@/types/friends";
import { useRelationship } from "./useRelationship";

// Asks the server whether the open conversation can be written in. Asks
// again when the relationship changes (an unfriend, an accepted request) and
// after the server refused a message. Unknown means "allowed" so the message
// box does not flicker while the answer is on its way.
export function useMessagingPermission(userId: string | undefined) {
  const relationship = useRelationship(userId ?? "").state;
  const revision = useChatStore((state) => state.messagingRevision);
  const [answer, setAnswer] = useState<{ userId: string; permission: MessagingResponse } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let isCurrent = true;
    apiService
      .get<MessagingResponse>(`/users/${userId}/messaging`)
      .then((permission) => {
        if (isCurrent) setAnswer({ userId, permission });
      })
      // A failed check must not lock the conversation; sending still checks.
      .catch(() => {
        if (isCurrent) setAnswer(null);
      });
    return () => {
      isCurrent = false;
    };
  }, [userId, relationship, revision]);

  // An answer that belongs to the previous conversation is not used.
  return answer && answer.userId === userId ? answer.permission : null;
}
