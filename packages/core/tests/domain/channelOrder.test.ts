import { describe, expect, it } from 'vitest';
import { LOOSE, diffMoves, layoutOf, moveCategory, moveChannel, newParentOf, overwritesDiffer, resolveDrop, stepCategory, stepChannel } from '@discordy/core/domain/channelOrder';
import { ChannelType, type Channel } from '@discordy/core/contracts/rest';

const ch = (id: string, position: number, parent_id: string | null = null, type: number = ChannelType.GUILD_TEXT): Channel =>
  ({ id, guild_id: 'g', name: id, type, position, parent_id }) as Channel;

const channels = [
  ch('loose', 0),
  ch('catA', 0, null, ChannelType.GUILD_CATEGORY),
  ch('a1', 0, 'catA'),
  ch('a2', 1, 'catA'),
  ch('catB', 1, null, ChannelType.GUILD_CATEGORY),
  ch('b1', 0, 'catB'),
  ch('thread', 0, 'a1', 11),
];

describe('channelOrder', () => {
  const layout = layoutOf(channels);

  it('groups channels by category in position order and ignores threads', () => {
    expect(layout).toEqual({ loose: ['loose'], categories: [{ id: 'catA', children: ['a1', 'a2'] }, { id: 'catB', children: ['b1'] }] });
  });

  it('reorders within a category', () => {
    const next = moveChannel(layout, 'a2', { parent: 'catA', index: 0 });
    expect(next.categories[0]!.children).toEqual(['a2', 'a1']);
    expect(diffMoves(channels, next)).toEqual([
      { id: 'a2', position: 0 },
      { id: 'a1', position: 1 },
    ]);
  });

  it('moves across categories and reports the parent change', () => {
    const next = moveChannel(layout, 'a1', { parent: 'catB', index: 1 });
    expect(next.categories[1]!.children).toEqual(['b1', 'a1']);
    expect(diffMoves(channels, next)).toEqual([
      { id: 'a2', position: 0 },
      { id: 'a1', position: 1, parent_id: 'catB' },
    ]);
    expect(newParentOf(channels, next, 'a1')).toBe('catB');
  });

  it('asks the server to sync permissions only for the moved channel', () => {
    const next = moveChannel(layout, 'loose', { parent: 'catA', index: 0 });
    const moves = diffMoves(channels, next, { lockPermissionsFor: 'loose' });
    expect(moves.find((m) => m.id === 'loose')).toEqual({ id: 'loose', position: 0, parent_id: 'catA', lock_permissions: true });
    expect(moves.find((m) => m.id === 'a1')).toEqual({ id: 'a1', position: 1 });
  });

  it('moves a channel out of its category to the top level', () => {
    const next = moveChannel(layout, 'b1', { parent: null, index: 0 });
    expect(diffMoves(channels, next)).toContainEqual({ id: 'b1', position: 0, parent_id: null });
    expect(diffMoves(channels, next)).toContainEqual({ id: 'loose', position: 1 });
  });

  it('reorders categories and never nests them', () => {
    const next = moveCategory(layout, 'catB', 0);
    expect(next.categories.map((g) => g.id)).toEqual(['catB', 'catA']);
    expect(diffMoves(channels, next).map((m) => m.id)).toEqual(['catB', 'catA']);
    expect(moveChannel(layout, 'a1', { parent: 'a2', index: 0 })).toBe(layout);
  });

  it('steps with the keyboard, crossing category edges', () => {
    expect(stepChannel(layout, 'a1', 1).categories[0]!.children).toEqual(['a2', 'a1']);
    expect(stepChannel(layout, 'a2', 1).categories[1]!.children).toEqual(['a2', 'b1']);
    expect(stepChannel(layout, 'b1', -1).categories[0]!.children).toEqual(['a1', 'a2', 'b1']);
    expect(stepChannel(layout, 'loose', -1)).toBe(layout);
    expect(stepCategory(layout, 'catA', 1).categories.map((g) => g.id)).toEqual(['catB', 'catA']);
    expect(stepCategory(layout, 'catA', -1).categories.map((g) => g.id)).toEqual(['catA', 'catB']);
  });

  it('emits nothing when the order is unchanged', () => {
    expect(diffMoves(channels, layout)).toEqual([]);
  });

  it('compares overwrites regardless of order', () => {
    const o = (id: string) => ({ id, type: 0 as const, allow: '1', deny: '0' });
    expect(overwritesDiffer([o('1'), o('2')], [o('2'), o('1')])).toBe(false);
    expect(overwritesDiffer([o('1')], [])).toBe(true);
    expect(overwritesDiffer(undefined, [])).toBe(false);
  });

  it('resolves drops onto rows, headers and empty space', () => {
    const chan = (id: string) => ({ kind: 'channel' as const, id });
    const cat = (id: string) => ({ kind: 'category' as const, id });
    expect(resolveDrop(layout, chan('b1'), chan('a1'), 'before').categories[0]!.children).toEqual(['b1', 'a1', 'a2']);
    expect(resolveDrop(layout, chan('b1'), chan('a1'), 'after').categories[0]!.children).toEqual(['a1', 'b1', 'a2']);
    expect(resolveDrop(layout, chan('a2'), cat('catB'), 'start').categories[1]!.children).toEqual(['a2', 'b1']);
    expect(resolveDrop(layout, chan('a2'), cat('catB'), 'end').categories[1]!.children).toEqual(['b1', 'a2']);
    expect(resolveDrop(layout, chan('a2'), cat(LOOSE), 'end').loose).toEqual(['loose', 'a2']);
    expect(resolveDrop(layout, cat('catA'), cat('catB'), 'after').categories.map((g) => g.id)).toEqual(['catB', 'catA']);
    expect(resolveDrop(layout, cat('catA'), chan('a1'), 'before')).toBe(layout);
    expect(resolveDrop(layout, chan('a1'), chan('a1'), 'after')).toBe(layout);
  });
});
