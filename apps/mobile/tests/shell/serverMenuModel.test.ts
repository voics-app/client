import { Permission } from '@discordy/core/contracts/permissions';
import { canDeleteWithName, serverMenuEntries } from '../../src/shell/serverMenuModel';

describe('serverMenuEntries', () => {
  it('offers nothing but leaving to a plain member', () => {
    expect(serverMenuEntries(0n, false, true)).toEqual({ invite: false, settings: false, leave: true, delete: false });
  });

  it('offers invites only with Create Invite and a channel to invite through', () => {
    expect(serverMenuEntries(Permission.CREATE_INSTANT_INVITE, false, true).invite).toBe(true);
    expect(serverMenuEntries(Permission.CREATE_INSTANT_INVITE, false, false).invite).toBe(false);
  });

  it('offers settings for manage server, roles or channels, as the desktop menu does', () => {
    for (const bit of [Permission.MANAGE_GUILD, Permission.MANAGE_ROLES, Permission.MANAGE_CHANNELS]) {
      expect(serverMenuEntries(bit, false, false).settings).toBe(true);
    }
    expect(serverMenuEntries(Permission.KICK_MEMBERS, false, false).settings).toBe(false);
  });

  it('does not let the owner leave their own server, and lets only the owner delete it', () => {
    expect(serverMenuEntries(0n, true, false)).toMatchObject({ leave: false, delete: true });
    expect(serverMenuEntries(~0n, false, true).delete).toBe(false);
  });
});

describe('canDeleteWithName', () => {
  it('needs the name typed back, ignoring case and spaces', () => {
    expect(canDeleteWithName(' home base ', 'Home Base')).toBe(true);
    expect(canDeleteWithName('Home', 'Home Base')).toBe(false);
    expect(canDeleteWithName('', '')).toBe(false);
  });
});


it('does not expose mobile server settings for appeal-only access', () => {
  expect(serverMenuEntries(Permission.MANAGE_BAN_APPEALS, false, false).settings).toBe(false);
});
