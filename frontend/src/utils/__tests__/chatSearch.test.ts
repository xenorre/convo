import { describe, expect, it } from 'vitest';
import type { ChatSummary } from '@/types/chat';
import { filterChats } from '../chatSearch';

const chat = (fullName: string, text?: string): ChatSummary => ({
  _id: fullName,
  fullName,
  profilePic: '',
  ...(text !== undefined && {
    lastMessage: { _id: `${fullName}-m`, senderId: fullName, text, hasAttachment: false, createdAt: '2026-10-20T10:00:00.000Z' },
  }),
});

const chats = [
  chat('Celina Wiśniewska', 'Umowa w załączniku'),
  chat('Łukasz Żółć', 'Do zobaczenia'),
  chat('Anna Kowalska'),
];

describe('filterChats', () => {
  it('returns the same list for an empty or blank query', () => {
    expect(filterChats(chats, '')).toBe(chats);
    expect(filterChats(chats, '   ')).toBe(chats);
  });

  it('ignores case and Polish diacritics, including ł', () => {
    expect(filterChats(chats, 'WISNIEWSKA').map(c => c.fullName)).toEqual(['Celina Wiśniewska']);
    expect(filterChats(chats, 'lukasz zolc').map(c => c.fullName)).toEqual(['Łukasz Żółć']);
    expect(filterChats(chats, 'żółć').map(c => c.fullName)).toEqual(['Łukasz Żółć']);
  });

  it('requires every word, in any order, across name and last message', () => {
    expect(filterChats(chats, 'umowa celina').map(c => c.fullName)).toEqual(['Celina Wiśniewska']);
    expect(filterChats(chats, 'zalaczniku')).toHaveLength(1);
    expect(filterChats(chats, 'celina zobaczenia')).toEqual([]);
  });

  it('keeps the original order of matches', () => {
    const ordered = [chat('Anna B'), chat('Anna A')];
    expect(filterChats(ordered, 'anna').map(c => c.fullName)).toEqual(['Anna B', 'Anna A']);
  });
});
