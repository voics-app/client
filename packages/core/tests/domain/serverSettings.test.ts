import { describe, expect, it } from 'vitest';
import { Permission } from '../../src/contracts/permissions';
import { canOpenServerSettings, serverSettingsTabs } from '../../src/domain/serverSettings';

const shown = (perms: bigint) => serverSettingsTabs(perms).filter((t) => t.show).map((t) => t.id);

describe('serverSettingsTabs', () => {
  it('shows only Members to someone with no management permission', () => {
    expect(shown(0n)).toEqual(['profile', 'members']);
  });

  it('opens a page per permission', () => {
    expect(shown(Permission.MANAGE_ROLES)).toEqual(['roles', 'profile', 'members']);
    expect(shown(Permission.BAN_MEMBERS)).toEqual(['profile', 'members', 'bans']);
    expect(shown(Permission.MANAGE_GUILD)).toEqual(['overview', 'rules', 'onboarding', 'welcome', 'profile', 'members', 'invites', 'template', 'discovery', 'integrations']);
    expect(shown(Permission.MANAGE_WEBHOOKS)).toEqual(['profile', 'members', 'integrations']);
  });
});

describe('canOpenServerSettings', () => {
  it('lets an audit-only role reach the log without exposing management tabs', () => {
    expect(canOpenServerSettings(Permission.VIEW_AUDIT_LOG)).toBe(true);
    expect(shown(Permission.VIEW_AUDIT_LOG)).toEqual(['profile', 'members', 'audit']);
  });
  it('needs one of manage server, roles or channels', () => {
    expect(canOpenServerSettings(0n)).toBe(false);
    expect(canOpenServerSettings(Permission.KICK_MEMBERS)).toBe(false);
    expect(canOpenServerSettings(Permission.MANAGE_CHANNELS)).toBe(true);
    expect(canOpenServerSettings(Permission.MANAGE_ROLES)).toBe(true);
    expect(canOpenServerSettings(Permission.MANAGE_GUILD)).toBe(true);
    expect(canOpenServerSettings(Permission.MANAGE_WEBHOOKS)).toBe(true);
  });
});
