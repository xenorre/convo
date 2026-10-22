import { describe, expect, it } from 'vitest';
import { describeMute, isChatMuted } from '@/utils/chatMute';

describe('chat mutes', () => {
  const now = new Date('2026-10-22T10:00:00');

  it('is muted with no end, or until a time still ahead', () => {
    const mutes = { a: null, b: '2026-10-22T11:00:00', c: '2026-10-22T09:00:00' };

    expect(isChatMuted(mutes, 'a', now.getTime())).toBe(true);
    expect(isChatMuted(mutes, 'b', now.getTime())).toBe(true);
    expect(isChatMuted(mutes, 'c', now.getTime())).toBe(false);
    expect(isChatMuted(mutes, 'd', now.getTime())).toBe(false);
  });

  it('says when notifications come back', () => {
    expect(describeMute(null, now)).toBe('Muted until you turn it back on');
    expect(describeMute(new Date('2026-10-22T18:30:00').toISOString(), now)).toBe('Muted until 18:30');
    expect(describeMute(new Date('2026-10-23T08:30:00').toISOString(), now)).toBe('Muted until tomorrow at 08:30');
  });
});
