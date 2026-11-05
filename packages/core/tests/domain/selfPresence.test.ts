import { describe, expect, it } from 'vitest';
import {
  activeCustomStatus,
  buildCustomStatus,
  customStatusActivities,
  effectiveStatus,
  expiryFor,
  isExpired,
  nextAutoIdle,
  customStatusLine,
  selfPresencePayload,
  shownStatus,
  statusLabel,
  STATUS_CHOICES,
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

describe('buildCustomStatus', () => {
  it('stores trimmed text with its expiry and emoji', () => {
    expect(buildCustomStatus('  at lunch ', '2026-01-01T00:00:00.000Z', { name: '🍜' })).toEqual({ text: 'at lunch', emoji_id: null, emoji_name: '🍜', expires_at: '2026-01-01T00:00:00.000Z' });
  });

  it('keeps an emoji with no text, and clears the status when both are empty', () => {
    expect(buildCustomStatus('', null, { name: '🍜', id: '7' })).toEqual({ text: null, emoji_id: '7', emoji_name: '🍜', expires_at: null });
    expect(buildCustomStatus('   ')).toBeNull();
    expect(buildCustomStatus(null)).toBeNull();
  });

  it('caps the text at 128 characters', () => {
    expect(buildCustomStatus('x'.repeat(200))?.text).toHaveLength(128);
  });
});

describe('status shown on your own avatar', () => {
  it('prefers what the gateway reports, so automatic idle shows', () => {
    expect(shownStatus('idle', 'online')).toBe('idle');
  });
  it('falls back to the chosen status while offline or unknown', () => {
    expect(shownStatus('offline', 'dnd')).toBe('dnd');
    expect(shownStatus(undefined, 'invisible')).toBe('invisible');
    expect(shownStatus(undefined, undefined)).toBe('online');
  });
  it('names every choice', () => {
    expect(STATUS_CHOICES.map((s) => statusLabel(s.id))).toEqual(['Online', 'Idle', 'Do not disturb', 'Invisible']);
  });
});

describe('customStatusLine', () => {
  const now = Date.parse('2026-11-05T12:00:00Z');
  it('joins the emoji and text', () => {
    expect(customStatusLine({ text: 'Lunch', emoji_id: null, emoji_name: 'ramen', expires_at: null }, now)).toBe('ramen Lunch');
  });
  it('leaves a custom emoji out and drops an expired status', () => {
    expect(customStatusLine({ text: 'Hi', emoji_id: '1', emoji_name: 'wave', expires_at: null }, now)).toBe('Hi');
    expect(customStatusLine({ text: 'Hi', emoji_id: null, emoji_name: null, expires_at: '2026-11-05T11:00:00Z' }, now)).toBe('');
    expect(customStatusLine(null, now)).toBe('');
  });
});
