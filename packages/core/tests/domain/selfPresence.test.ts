import { describe, expect, it } from 'vitest';
import {
  activeCustomStatus,
  customStatusActivities,
  effectiveStatus,
  expiryFor,
  isExpired,
  nextAutoIdle,
  selfPresencePayload,
} from '@discordy/core/domain/selfPresence';

const base = { idleSeconds: 0, locked: false, timeoutMinutes: 10, manual: undefined } as const;

describe('automatic idle', () => {
  it('goes idle after the timeout and not before', () => {
    expect(nextAutoIdle({ ...base, idleSeconds: 599 })).toBe(false);
    expect(nextAutoIdle({ ...base, idleSeconds: 600 })).toBe(true);
  });
  it('returns to online on any input', () => {
    expect(nextAutoIdle({ ...base, idleSeconds: 2 })).toBe(false);
  });
  it('goes idle at once when the screen locks', () => {
    expect(nextAutoIdle({ ...base, locked: true })).toBe(true);
  });
  it('is off when the timeout is 0', () => {
    expect(nextAutoIdle({ ...base, timeoutMinutes: 0, idleSeconds: 99999 })).toBe(false);
  });
  it('never overrides a manual DND, Invisible or Idle choice', () => {
    for (const manual of ['dnd', 'invisible', 'idle'] as const) {
      expect(nextAutoIdle({ ...base, manual, idleSeconds: 99999, locked: true })).toBe(false);
      expect(effectiveStatus(manual, true)).toBe(manual);
    }
    expect(effectiveStatus('online', true)).toBe('idle');
    expect(effectiveStatus(undefined, true)).toBe('idle');
    expect(effectiveStatus('online', false)).toBe('online');
  });
});

describe('custom status', () => {
  const now = new Date(2026, 9, 22, 15, 30, 0);
  it('computes expiry choices', () => {
    expect(expiryFor('never', now)).toBeNull();
    expect(Date.parse(expiryFor('30m', now)!) - now.getTime()).toBe(30 * 60_000);
    expect(Date.parse(expiryFor('1h', now)!) - now.getTime()).toBe(3_600_000);
    expect(Date.parse(expiryFor('4h', now)!) - now.getTime()).toBe(4 * 3_600_000);
    expect(new Date(expiryFor('today', now)!).getTime()).toBe(new Date(2026, 9, 23).getTime());
  });
  it('expires', () => {
    const cs = { text: 'hi', expires_at: new Date(now.getTime() + 1000).toISOString() };
    expect(isExpired(cs, now.getTime())).toBe(false);
    expect(isExpired(cs, now.getTime() + 1000)).toBe(true);
    expect(isExpired({ text: 'hi' }, now.getTime())).toBe(false);
    expect(activeCustomStatus(cs, now.getTime() + 5000)).toBeNull();
  });
  it('is broadcast as a type 4 activity and in the presence payload', () => {
    expect(customStatusActivities({ text: 'brb', emoji_name: 'pizza' }, 0)).toEqual([{ name: 'Custom Status', type: 4, state: 'brb', emoji: { name: 'pizza' } }]);
    expect(customStatusActivities({ text: null }, 0)).toEqual([]);
    const p = selfPresencePayload('online', { text: 'brb' }, true, 0);
    expect(p).toMatchObject({ status: 'idle', afk: true });
    expect(p.activities).toHaveLength(1);
    expect(selfPresencePayload('dnd', null, true, 0)).toEqual({ status: 'dnd', activities: [], afk: false });
  });
});
