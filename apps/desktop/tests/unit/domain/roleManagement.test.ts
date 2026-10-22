import { describe, expect, it } from 'vitest';
import type { Role } from '@shared/contracts/rest';
import { applyPositions, canManageRole, hierarchyList, isAdministrator, memberCounts, reorderPositions } from '@renderer/domain/roleManagement';

const G = 'g';
const role = (id: string, position: number, extra: Partial<Role> = {}): Role => ({ id, name: id, color: 0, hoist: false, position, permissions: '0', managed: false, mentionable: false, ...extra });
const roles = [role(G, 0), role('a', 1), role('b', 2), role('c', 3), role('d', 4)];

describe('hierarchy', () => {
  it('lists top first without @everyone', () => {
    expect(hierarchyList(roles, G).map((r) => r.id)).toEqual(['d', 'c', 'b', 'a']);
  });
  it('only manages roles strictly below the actor, owner everything', () => {
    expect(canManageRole(role('b', 2), G, 3, false)).toBe(true);
    expect(canManageRole(role('c', 3), G, 3, false)).toBe(false);
    expect(canManageRole(role('d', 4), G, 3, false)).toBe(false);
    expect(canManageRole(role('d', 4), G, 0, true)).toBe(true);
  });
});

describe('reorderPositions', () => {
  const list = hierarchyList(roles, G); // d c b a
  it('swaps slots between movable roles', () => {
    expect(reorderPositions(list, 'a', 2, 3, false)).toEqual([
      { id: 'a', position: 2 },
      { id: 'b', position: 1 },
    ]);
  });
  it('refuses locked roles and clamps drops above the lock', () => {
    expect(reorderPositions(list, 'c', 3, 3, false)).toEqual([]);
    expect(reorderPositions(list, 'a', 0, 3, false)).toEqual([
      { id: 'a', position: 2 },
      { id: 'b', position: 1 },
    ]);
  });
  it('never emits a position at or above the actor rank', () => {
    const changes = reorderPositions(list, 'a', 0, 3, false);
    expect(changes.every((c) => c.position < 3)).toBe(true);
  });
  it('lets the owner move anything and ignores no-ops', () => {
    expect(reorderPositions(list, 'a', 0, 0, true)).toEqual([
      { id: 'a', position: 4 },
      { id: 'd', position: 3 },
      { id: 'c', position: 2 },
      { id: 'b', position: 1 },
    ]);
    expect(reorderPositions(list, 'b', 2, 0, true)).toEqual([]);
  });
  it('applies changes to the role list', () => {
    const out = applyPositions(roles, [{ id: 'a', position: 2 }, { id: 'b', position: 1 }]);
    expect(hierarchyList(out, G).map((r) => r.id)).toEqual(['d', 'c', 'a', 'b']);
  });
});

describe('counts and flags', () => {
  it('counts members per role with @everyone as all', () => {
    expect(memberCounts([{ roles: ['a', 'b'] }, { roles: ['a'] }, { roles: [] }], G)).toEqual({ g: 3, a: 2, b: 1 });
  });
  it('detects administrator', () => {
    expect(isAdministrator('8')).toBe(true);
    expect(isAdministrator('1024')).toBe(false);
  });
});
