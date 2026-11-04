import { describe, expect, it } from 'vitest';
import { applyDrop, dropOnto, flatten, moveGuildToIndex, normalizeRail, patchFolder, railFromPositions, single, ungroup } from '@discordy/core/domain/railLayout';
import type { GuildFolder } from '@discordy/core/contracts/rest';

const folder = (id: number, ...ids: string[]): GuildFolder => ({ id, name: null, color: null, guild_ids: ids });
const ids = (rail: GuildFolder[]) => rail.map((e) => (e.id === null ? e.guild_ids[0] : `[${e.guild_ids.join('')}]`));

describe('railLayout', () => {
  it('puts servers without a saved place in a stable order, oldest first', () => {
    const expected = ['9', '10', '200'];
    expect(flatten(railFromPositions([], ['200', '9', '10']))).toEqual(expected);
    expect(flatten(railFromPositions([], ['10', '200', '9']))).toEqual(expected);
  });

  const base = railFromPositions(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd']);

  it('builds from legacy positions and appends unknown servers', () => {
    expect(ids(railFromPositions(['c', 'x', 'a'], ['a', 'b', 'c']))).toEqual(['c', 'a', 'b']);
  });

  it('normalises: drops unknown, duplicate and empty entries', () => {
    const rail = normalizeRail([folder(1, 'a', 'x'), folder(2, 'x'), single('a'), single('b')], ['a', 'b', 'c']);
    expect(ids(rail)).toEqual(['[a]', 'b', 'c']);
  });

  it('reorders a server', () => {
    expect(ids(moveGuildToIndex(base, 'd', 0))).toEqual(['d', 'a', 'b', 'c']);
  });

  it('dropping a server on another creates a folder holding both', () => {
    const rail = dropOnto(base, 'c', 'a');
    expect(ids(rail)).toEqual(['[ac]', 'b', 'd']);
    expect(rail[0]!.id).toBe(1);
  });

  it('dropping onto a folder joins it', () => {
    const rail = applyDrop(dropOnto(base, 'c', 'a'), { kind: 'guild', id: 'd' }, { kind: 'folder', id: 1 }, 'onto');
    expect(ids(rail)).toEqual(['[acd]', 'b']);
  });

  it('before/after inside a folder positions within it', () => {
    const start = [folder(1, 'a', 'b'), single('c')];
    expect(ids(applyDrop(start, { kind: 'guild', id: 'c' }, { kind: 'guild', id: 'a' }, 'before'))).toEqual(['[cab]']);
    expect(ids(applyDrop(start, { kind: 'guild', id: 'c' }, { kind: 'guild', id: 'a' }, 'after'))).toEqual(['[acb]']);
  });

  it('dragging out of a folder leaves a plain server when one remains', () => {
    const start = [folder(1, 'a', 'b'), single('c')];
    const rail = applyDrop(start, { kind: 'guild', id: 'a' }, { kind: 'guild', id: 'c' }, 'after');
    expect(ids(rail)).toEqual(['b', 'c', 'a']);
  });

  it('moves a whole folder', () => {
    const start = [single('a'), folder(1, 'b', 'c'), single('d')];
    expect(ids(applyDrop(start, { kind: 'folder', id: 1 }, { kind: 'guild', id: 'd' }, 'after'))).toEqual(['a', 'd', '[bc]']);
    expect(ids(applyDrop(start, { kind: 'folder', id: 1 }, { kind: 'guild', id: 'a' }, 'before'))).toEqual(['[bc]', 'a', 'd']);
  });

  it('ignores dropping on itself', () => {
    expect(applyDrop(base, { kind: 'guild', id: 'a' }, { kind: 'guild', id: 'a' }, 'onto')).toBe(base);
  });

  it('renames, recolours and ungroups a folder', () => {
    const start = [folder(1, 'a', 'b')];
    const renamed = patchFolder(start, 1, { name: '  Games ', color: 0xff0000 });
    expect(renamed[0]).toMatchObject({ name: 'Games', color: 0xff0000 });
    expect(patchFolder(renamed, 1, { name: ' ' })[0]!.name).toBeNull();
    expect(ids(ungroup(renamed, 1))).toEqual(['a', 'b']);
  });

  it('flattens to the legacy position list', () => {
    expect(flatten([folder(1, 'a', 'b'), single('c')])).toEqual(['a', 'b', 'c']);
  });
});
