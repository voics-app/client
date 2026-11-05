import { describe, expect, it } from 'vitest';
import { Permission } from '../../src/contracts/permissions';
import { canOpenServerSettings, serverSettingsTabs } from '../../src/domain/serverSettings';

const shown = (perms: bigint) => serverSettingsTabs(perms).filter((t) => t.show).map((t) => t.id);

describe('serverSettingsTabs', () => {
  it('shows only Members to someone with no management permission', () => {
    expect(shown(0n)).toEqual(['members']);
  });

  it('opens a page per permission', () => {
    expect(shown(Permission.MANAGE_ROLES)).toEqual(['roles', 'members']);
    expect(shown(Permission.BAN_MEMBERS)).toEqual(['members', 'bans']);
    expect(shown(Permission.MANAGE_GUILD)).toEqual(['overview', 'members', 'invites', 'template', 'discovery']);
  });
});

describe('canOpenServerSettings', () => {
  it('needs one of manage server, roles or channels', () => {
    expect(canOpenServerSettings(0n)).toBe(false);
    expect(canOpenServerSettings(Permission.KICK_MEMBERS)).toBe(false);
    expect(canOpenServerSettings(Permission.MANAGE_CHANNELS)).toBe(true);
    expect(canOpenServerSettings(Permission.MANAGE_ROLES)).toBe(true);
    expect(canOpenServerSettings(Permission.MANAGE_GUILD)).toBe(true);
  });
});
