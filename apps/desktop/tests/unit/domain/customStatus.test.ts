import { describe, expect, it } from 'vitest';
import { statusLine, truncateText } from '@renderer/domain/memberList';
import { menuTopAbove } from '@renderer/domain/menuPlacement';
import { activeCustomStatus, clampStatusText, customStatusActivities, expiryFor, statusCharsLeft } from '@renderer/domain/selfPresence';

describe('custom status activity', () => {
  it('carries a custom emoji id', () => {
    expect(customStatusActivities({ text: 'hi', emoji_name: 'party', emoji_id: '42' }, 0)[0]?.emoji).toEqual({ name: 'party', id: '42' });
  });
  it('allows an emoji with no text', () => {
    const [a] = customStatusActivities({ text: null, emoji_name: '🍕' }, 0);
    expect(a).toMatchObject({ type: 4, name: 'Custom Status', state: null, emoji: { name: '🍕' } });
  });
  it('is empty once expired', () => {
    const cs = { text: 'brb', expires_at: new Date(1000).toISOString() };
    expect(customStatusActivities(cs, 999)).toHaveLength(1);
    expect(customStatusActivities(cs, 1000)).toEqual([]);
    expect(activeCustomStatus(cs, 1000)).toBeNull();
  });
});

describe('expiry choices', () => {
  it('"today" is the next local midnight, also late in the evening', () => {
    const late = new Date(2026, 10, 3, 23, 59, 30);
    expect(new Date(expiryFor('today', late)!).getTime()).toBe(new Date(2026, 10, 4).getTime());
  });
  it('relative choices add the duration', () => {
    const now = new Date(2026, 10, 3, 10, 0, 0);
    expect(new Date(expiryFor('30m', now)!).getTime() - now.getTime()).toBe(30 * 60_000);
    expect(new Date(expiryFor('4h', now)!).getTime() - now.getTime()).toBe(4 * 3_600_000);
    expect(expiryFor('never', now)).toBeNull();
  });
});

describe('status text limits', () => {
  it('clamps to 128 code points and trims', () => {
    expect(clampStatusText('  hi  ')).toBe('hi');
    expect([...clampStatusText('a'.repeat(200))]).toHaveLength(128);
    expect([...clampStatusText('😀'.repeat(200))]).toHaveLength(128);
  });
  it('counts characters left by code point', () => {
    expect(statusCharsLeft('')).toBe(128);
    expect(statusCharsLeft('😀😀')).toBe(126);
  });
});

describe('display truncation', () => {
  it('leaves short text alone and ellipsises long text', () => {
    expect(truncateText('short', 10)).toBe('short');
    expect(truncateText('abcdefghij', 5)).toBe('abcd…');
  });
  it('keeps the full text for the tooltip', () => {
    const line = statusLine([{ name: 'Custom Status', type: 4, state: 'x'.repeat(100), emoji: { name: '🍕' } }], 20);
    expect(line?.text).toHaveLength(20);
    expect(line?.title).toBe(`🍕 ${'x'.repeat(100)}`);
    expect(line?.emoji).toEqual({ name: '🍕' });
  });
  it('shows an emoji-only status and nothing for none', () => {
    expect(statusLine([{ name: 'Custom Status', type: 4, state: null, emoji: { name: '🍕' } }])?.text).toBe('');
    expect(statusLine([{ name: 'Custom Status', type: 4, state: null }])).toBeNull();
    expect(statusLine(undefined)).toBeNull();
  });
  it('prefers a real activity over the custom status', () => {
    expect(statusLine([{ name: 'Custom Status', type: 4, state: 'brb' }, { name: 'Factorio', type: 0 }])?.text).toBe('Playing Factorio');
  });
});

describe('menu anchoring', () => {
  it('opens above the trigger when there is room', () => {
    expect(menuTopAbove({ top: 800, bottom: 850 }, 6, 900)).toBe(800 - 6 - (6 * 34 + 16));
  });
  it('flips below when the trigger is near the top', () => {
    expect(menuTopAbove({ top: 20, bottom: 70 }, 6, 900)).toBe(76);
  });
  it('stays inside a short window', () => {
    expect(menuTopAbove({ top: 20, bottom: 70 }, 6, 200)).toBe(8);
  });
});
