import { mayUnpin } from '../../src/pins/pinsModel';

describe('mayUnpin', () => {
  it('needs Manage Messages in a server', () => {
    expect(mayUnpin({ guild_id: 'g1' }, { canManageMessages: false })).toBe(false);
    expect(mayUnpin({ guild_id: 'g1' }, { canManageMessages: true })).toBe(true);
  });

  it('lets anyone unpin in a direct message', () => {
    expect(mayUnpin({ guild_id: null }, { canManageMessages: false })).toBe(true);
    expect(mayUnpin({}, { canManageMessages: false })).toBe(true);
  });
});
