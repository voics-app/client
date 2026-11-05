import { Permission } from '@discordy/core/contracts/permissions';
import { serverMenuEntries } from '../../src/shell/serverMenuModel';

describe('serverMenuEntries', () => {
  it('offers nothing but leaving to a plain member', () => {
    expect(serverMenuEntries(0n, false, true)).toEqual({ invite: false, settings: false, leave: true });
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

  it('does not let the owner leave their own server', () => {
    expect(serverMenuEntries(0n, true, false).leave).toBe(false);
  });
});
