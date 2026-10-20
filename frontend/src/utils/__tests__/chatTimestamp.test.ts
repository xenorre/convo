import { describe, expect, it } from 'vitest';
import { formatChatTimestamp, formatMessageTime } from '../chatTimestamp';

// Local-time constructors keep these independent of the machine's time zone.
const now = new Date(2026, 9, 20, 9, 15); // Tue 20 Oct 2026, 09:15

describe('formatChatTimestamp', () => {
  it('shows the time for messages from today', () => {
    expect(formatChatTimestamp(new Date(2026, 9, 20, 0, 5), now, 'en-GB')).toBe('00:05');
  });

  it('treats a timestamp slightly ahead of the clock as today', () => {
    expect(formatChatTimestamp(new Date(2026, 9, 20, 9, 16), now, 'en-GB')).toBe('09:16');
  });

  it('says yesterday for the previous calendar day, even minutes ago', () => {
    expect(formatChatTimestamp(new Date(2026, 9, 19, 23, 59), now, 'en-GB')).toBe('Yesterday');
    expect(formatChatTimestamp(new Date(2026, 9, 19, 23, 59), now, 'pl-PL')).toBe('Wczoraj');
  });

  it('shows the weekday within the last week', () => {
    expect(formatChatTimestamp(new Date(2026, 9, 18, 12, 0), now, 'en-GB')).toBe('Sun');
    expect(formatChatTimestamp(new Date(2026, 9, 14, 12, 0), now, 'en-GB')).toBe('Wed');
  });

  it('shows a date after a week and adds the year only for other years', () => {
    expect(formatChatTimestamp(new Date(2026, 9, 13, 12, 0), now, 'en-GB')).toBe('13/10');
    expect(formatChatTimestamp(new Date(2025, 11, 31, 12, 0), now, 'en-GB')).toBe('31/12/25');
  });

  it('uses the English UI locale by default', () => {
    expect(formatChatTimestamp(new Date(2026, 9, 19, 23, 59), now)).toBe('Yesterday');
    expect(formatChatTimestamp(new Date(2026, 9, 20, 14, 32), now)).toBe('14:32');
  });

  it('returns an empty label for an invalid date', () => {
    expect(formatChatTimestamp('not a date', now, 'en-GB')).toBe('');
  });
});

describe('formatMessageTime', () => {
  it('shows local time, not UTC', () => {
    const local = new Date(2026, 9, 20, 8, 42);
    expect(formatMessageTime(local)).toBe('08:42');
    expect(formatMessageTime(local.toISOString())).toBe('08:42');
  });
});
