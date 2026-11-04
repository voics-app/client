import { describe, expect, it } from 'vitest';
import { PERMISSION_CATALOG, permissionsByGroup } from '@discordy/core/domain/permissionCatalog';

describe('permission catalog', () => {
  it('has unique permissions with distinct bits', () => {
    const bits = PERMISSION_CATALOG.map((p) => p.bit);
    expect(new Set(bits).size).toBe(bits.length);
  });

  it('omits guild-wide permissions from channel overwrite editors', () => {
    const names = permissionsByGroup(true).flatMap((g) => g.entries.map((e) => e.name));
    expect(names).toContain('SEND_MESSAGES');
    expect(names).not.toContain('ADMINISTRATOR');
    expect(names).not.toContain('BAN_MEMBERS');
  });

  it('lists every group when editing roles', () => {
    expect(permissionsByGroup(false).map((g) => g.group)).toEqual(['General', 'Membership', 'Text', 'Voice', 'Advanced']);
  });
});
