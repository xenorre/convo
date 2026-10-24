import { useCallback, useEffect, useRef } from "react";
import { useAuthStore } from "@/store/useAuthStore";

// Repeat "typing" this often while the user keeps typing; the other side
// forgets it after a few seconds without one.
export const TYPING_REPEAT_MS = 2500;
// Stop once the user hasn't typed for this long.
export const TYPING_IDLE_MS = 3000;

// Tells the person in this conversation when the user is typing to them.
// `onInput` goes on every change of the message text; `stop` when it is sent.
export function useTypingSignal(userId: string | undefined) {
  const lastSentAt = useRef(0);
  const isTyping = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const send = useCallback(
    (typing: boolean) => {
      const socket = useAuthStore.getState().socket;
      if (!userId || !socket?.connected) return;
      socket.emit("typing", { to: userId, isTyping: typing });
    },
    [userId],
  );

  const stop = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = null;
    if (!isTyping.current) return;
    isTyping.current = false;
    lastSentAt.current = 0;
    send(false);
  }, [send]);

  const onInput = useCallback(
    (text: string) => {
      if (!text.trim()) return stop();
      const now = Date.now();
      if (!isTyping.current || now - lastSentAt.current >= TYPING_REPEAT_MS) {
        isTyping.current = true;
        lastSentAt.current = now;
        send(true);
      }
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(stop, TYPING_IDLE_MS);
    },
    [send, stop],
  );

  // Leaving the conversation (or minimizing it) ends typing too.
  useEffect(() => stop, [stop]);

  return { onInput, stop };
}
