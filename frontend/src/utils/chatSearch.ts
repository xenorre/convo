import type { ChatSummary } from "@/types/chat";

// "ł" has no Unicode decomposition, so it is mapped by hand.
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ł/gi, "l")
    .toLocaleLowerCase();

const queryTerms = (query: string) => normalize(query).split(/\s+/).filter(Boolean);

// Every word of the query has to appear in the partner's name or in the
// last message preview, ignoring case and Polish diacritics.
export function filterChats(chats: ChatSummary[], query: string): ChatSummary[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return chats;

  return chats.filter((chat) => {
    const haystack = normalize(`${chat.fullName} ${chat.lastMessage?.text ?? ""}`);
    return terms.every((term) => haystack.includes(term));
  });
}
