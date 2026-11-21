import { Permission } from '@discordy/core/contracts/permissions';
import { settingsPages } from '../../src/serverSettings/settingsPages';

const ids = (perms: bigint) => settingsPages(perms).map((p) => p.id);

describe('settingsPages', () => {
  it('gives a member with no permission only the read-only Members page, as desktop does', () => {
    expect(ids(0n)).toEqual(['members']);
  });

  it('adds one page per permission, in the desktop order', () => {
    expect(ids(Permission.MANAGE_GUILD | Permission.MANAGE_ROLES | Permission.MANAGE_CHANNELS)).toEqual(['overview', 'roles', 'members', 'invites', 'channels']);
  });

  it('adds Emoji, Bans and Audit log with their own permissions', () => {
    expect(ids(Permission.BAN_MEMBERS | Permission.VIEW_AUDIT_LOG | Permission.MANAGE_GUILD_EXPRESSIONS)).toEqual(['emoji', 'members', 'bans', 'audit']);
    expect(ids(Permission.BAN_MEMBERS)).toEqual(['members', 'bans']);
  });

  it('does not offer the desktop pages the mobile app does not have (template, discovery)', () => {
    expect(ids(Permission.MANAGE_GUILD)).toEqual(['overview', 'members', 'invites']);
  });

  it('shows Channels only with Manage Channels', () => {
    expect(ids(Permission.MANAGE_CHANNELS)).toEqual(['members', 'channels']);
    expect(ids(Permission.MANAGE_GUILD)).not.toContain('channels');
  });
});


it('exposes appeals in mobile ban settings to an appeal-only moderator', () => {
  expect(ids(Permission.MANAGE_BAN_APPEALS)).toContain('bans');
  expect(ids(Permission.BAN_MEMBERS | Permission.MANAGE_BAN_APPEALS)).toContain('bans');
});
