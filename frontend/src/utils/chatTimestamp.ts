const DAY_MS = 24 * 60 * 60 * 1000;

// The UI is in English; en-GB keeps a 24-hour clock and day-first dates.
const APP_LOCALE = "en-GB";

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

// Calendar days between two dates; rounding absorbs DST shifts.
const daysBetween = (earlier: Date, later: Date) =>
  Math.round((startOfDay(later) - startOfDay(earlier)) / DAY_MS);

// Short label for the chat list: time today, "Yesterday", weekday within
// the last week, otherwise a date (with the year only when it differs).
export function formatChatTimestamp(
  value: string | Date,
  now: Date = new Date(),
  locale: string = APP_LOCALE,
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const days = daysBetween(date, now);

  if (days <= 0) return formatMessageTime(date, locale);
  if (days === 1) {
    const yesterday = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-1, "day");
    return yesterday.charAt(0).toLocaleUpperCase(locale) + yesterday.slice(1);
  }
  if (days < 7) {
    return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
  }
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "numeric",
    ...(date.getFullYear() !== now.getFullYear() && { year: "2-digit" }),
  }).format(date);
}

// Local time of a single message, e.g. "08:42".
export function formatMessageTime(value: string | Date, locale: string = APP_LOCALE): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date);
}

// Full date and time for the tooltip.
export function formatFullTimestamp(value: string | Date, locale: string = APP_LOCALE): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
