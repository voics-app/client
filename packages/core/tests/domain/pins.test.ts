import { describe, expect, it } from 'vitest';
import type { Channel } from '@discordy/core/contracts/rest';
import { MAX_PINNED_DMS, MAX_PINNED_PER_GUILD, isPinFull, orderPinnedFirst, pinnedChannelsOf, withPin, withoutPin } from '@discordy/core/domain/pins';

const ch = (id: string) => ({ id }) as unknown as Channel;

describe('orderPinnedFirst', () => {
  it('puts pinned channels first in pin order and keeps the rest in their order', () => {
    const list = [ch('a'), ch('b'), ch('c'), ch('d')];
    const { pinned, rest } = orderPinnedFirst(list, ['c', 'a']);
    expect(pinned.map((c) => c.id)).toEqual(['c', 'a']);
    expect(rest.map((c) => c.id)).toEqual(['b', 'd']);
  });
  it('ignores pins of channels that are not in the list', () => {
    const { pinned, rest } = orderPinnedFirst([ch('a')], ['gone', 'a']);
    expect(pinned.map((c) => c.id)).toEqual(['a']);
    expect(rest).toEqual([]);
  });
  it('returns everything as rest without pins', () => {
    expect(orderPinnedFirst([ch('a'), ch('b')], []).rest).toHaveLength(2);
  });
});

describe('withPin / withoutPin', () => {
  it('appends a new pin last', () => {
    expect(withPin(['a'], 'b', MAX_PINNED_DMS)).toEqual(['a', 'b']);
  });
  it('is idempotent for an already pinned id', () => {
    expect(withPin(['a', 'b'], 'a', MAX_PINNED_DMS)).toEqual(['a', 'b']);
  });
  it('refuses to exceed the limit', () => {
    expect(withPin(['1', '2', '3', '4', '5'], '6', MAX_PINNED_DMS)).toBeNull();
    expect(isPinFull(['1', '2', '3', '4', '5'], '6', MAX_PINNED_DMS)).toBe(true);
    expect(isPinFull(['1', '2', '3', '4', '5'], '5', MAX_PINNED_DMS)).toBe(false);
  });
  it('removes a pin', () => {
    expect(withoutPin(['a', 'b'], 'a')).toEqual(['b']);
    expect(withoutPin(['a'], 'x')).toEqual(['a']);
  });
  it('uses the documented limits', () => {
    expect(MAX_PINNED_DMS).toBe(5);
    expect(MAX_PINNED_PER_GUILD).toBe(10);
  });
});

describe('pinnedChannelsOf', () => {
  it('reads one server and tolerates missing settings', () => {
    expect(pinnedChannelsOf({ g1: ['a'] }, 'g1')).toEqual(['a']);
    expect(pinnedChannelsOf({ g1: ['a'] }, 'g2')).toEqual([]);
    expect(pinnedChannelsOf(undefined, 'g1')).toEqual([]);
  });
});
