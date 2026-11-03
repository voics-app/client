import { describe, expect, it } from 'vitest';
import { calendarDaysAgo, fullMessageTime, formatMessageTime } from '@renderer/domain/messageTime';

const TZ = 'UTC';
const NOW = Date.parse('2026-11-03T10:00:00Z');

describe('formatMessageTime', () => {
  it('says Today for the same calendar day', () => {
    expect(formatMessageTime('2026-11-03T00:05:00Z', NOW, 'en-US', TZ)).toMatch(/^Today at 12:05\sAM$/);
  });
  it('says Yesterday across midnight even when under 24h', () => {
    expect(formatMessageTime('2026-11-02T23:30:00Z', NOW, 'en-US', TZ)).toMatch(/^Yesterday at 11:30\sPM$/);
  });
  it('uses a short date for older messages', () => {
    expect(formatMessageTime('2026-10-20T15:04:00Z', NOW, 'en-US', TZ)).toMatch(/^10\/20\/26 3:04\sPM$/);
  });
  it('respects the viewer time zone', () => {
    expect(formatMessageTime('2026-11-03T02:00:00Z', NOW, 'en-US', 'America/Los_Angeles')).toMatch(/^Yesterday at 6:00\sPM$/);
  });
  it('returns empty for garbage', () => {
    expect(formatMessageTime('nope', NOW)).toBe('');
  });
});

describe('calendarDaysAgo', () => {
  it('counts calendar days', () => {
    expect(calendarDaysAgo(Date.parse('2026-10-31T12:00:00Z'), NOW, TZ)).toBe(3);
  });
});

describe('fullMessageTime', () => {
  it('includes weekday, date and time', () => {
    const text = fullMessageTime('2026-11-03T15:04:00Z', 'en-US', TZ);
    expect(text).toContain('Tuesday, November 3, 2026');
    expect(text).toMatch(/3:04\sPM/);
  });
});
