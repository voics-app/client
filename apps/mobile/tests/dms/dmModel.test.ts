import { ChannelType, RelationshipType, type Channel, type Relationship, type User } from '@discordy/core/contracts/rest';
import { dmListItems, dmRows } from '../../src/dms/dmModel';

const user = (id: string, extra: Partial<User> = {}): User => ({ id, username: `user${id}`, global_name: null, avatar: null, ...extra });
const dm = (id: string, extra: Partial<Channel> = {}): Channel => ({ id, type: ChannelType.DM, delivery_mode: 'standard', recipients: [user('2')], ...extra }) as Channel;

describe('dmRows', () => {
  it('lists 1:1 and group conversations, most recent activity first', () => {
    const channels = {
      a: dm('1000', { last_message_id: '9000000000000000' }),
      b: dm('1001', { type: ChannelType.GROUP_DM, name: 'Book club', recipients: [user('3'), user('4')], last_message_id: '9100000000000000' }),
    };
    const rows = dmRows({ channels, closed: {}, relationships: {} });
    expect(rows.map((r) => r.id)).toEqual(['1001', '1000']);
    expect(rows[0]).toMatchObject({ title: 'Book club', group: true, peer: null });
    expect(rows[1]).toMatchObject({ title: 'user2', group: false, peer: { id: '2' } });
  });

  it('names an unnamed group after its members and prefers a friend nickname for 1:1', () => {
    const relationships: Record<string, Relationship> = { '2': { id: '2', type: RelationshipType.FRIEND, user: user('2'), nickname: 'Pat the Cat' } };
    const rows = dmRows({
      channels: {
        a: dm('1000'),
        g: dm('1001', { type: ChannelType.GROUP_DM, recipients: [user('3', { global_name: 'Sam' }), user('4')] }),
      },
      closed: {},
      relationships,
    });
    expect(rows.find((r) => r.id === '1000')?.title).toBe('Pat the Cat');
    expect(rows.find((r) => r.id === '1001')?.title).toBe('Sam, user4');
  });

  it('hides closed DMs, guild channels and flags private delivery', () => {
    const channels = {
      a: dm('1000', { delivery_mode: 'ephemeral' }),
      b: dm('1001'),
      c: { id: 'x', type: ChannelType.GUILD_TEXT, guild_id: 'g1', delivery_mode: 'standard' } as Channel,
    };
    const rows = dmRows({ channels, closed: { '1001': '' }, relationships: {} });
    expect(rows.map((r) => [r.id, r.private])).toEqual([['1000', true]]);
  });
});

it('puts a favourite direct message before pinned and other conversations', () => {
  const rows = dmRows({ channels: { a: dm('1000'), b: dm('1001', { recipients: [user('3')] }) }, closed: {}, relationships: {} });
  const items = dmListItems(rows, ['1001'], ['2']);
  expect(items.map((item) => item.kind === 'header' ? item.title : item.row.id)).toEqual(['Favourites', '1000', 'Pinned', '1001']);
});
