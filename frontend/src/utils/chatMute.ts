import { formatFullTimestamp, formatMessageTime } from "@/utils/chatTimestamp";

export type MuteDuration = "1h" | "8h" | "24h" | "forever";

// The choices offered when muting, in menu order.
export const MUTE_OPTIONS: { duration: MuteDuration; label: string }[] = [
  { duration: "1h", label: "For 1 hour" },
  { duration: "8h", label: "For 8 hours" },
  { duration: "24h", label: "For 24 hours" },
  { duration: "forever", label: "Until I turn it back on" },
];

// A mute is in `mutes` with its end, or null when it has none.
export const isChatMuted = (mutes: Record<string, string | null>, userId: string, now = Date.now()) => {
  if (!(userId in mutes)) return false;
  const mutedUntil = mutes[userId];
  return mutedUntil === null || Date.parse(mutedUntil) > now;
};

// "Muted until 18:30" or "Muted until tomorrow at 08:30"; mutes last at most
// a day, so the full date is only a fallback.
export const describeMute = (mutedUntil: string | null, now = new Date()) => {
  if (mutedUntil === null) return "Muted until you turn it back on";
  const end = new Date(mutedUntil);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (end.toDateString() === now.toDateString()) return `Muted until ${formatMessageTime(end)}`;
  if (end.toDateString() === tomorrow.toDateString()) return `Muted until tomorrow at ${formatMessageTime(end)}`;
  return `Muted until ${formatFullTimestamp(end)}`;
};
