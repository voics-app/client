import { RelationshipType, type Relationship, type User } from '@discordy/core/contracts/rest';
import { emptyFriendsText, friendsList } from '../../src/friends/friendsListModel';

const user = (id: string, name: string): User => ({ id, username: name.toLowerCase(), global_name: name, avatar: null });
const rel = (id: string, name: string, type: number, extra: Partial<Relationship> = {}): Relationship => ({ id, type, user: user(id, name), ...extra }) as Relationship;
const all = [
  rel('1', 'Bea', RelationshipType.FRIEND),
  rel('2', 'Al', RelationshipType.FRIEND, { nickname: 'Alpha' }),
  rel('3', 'Cy', RelationshipType.INCOMING),
  rel('4', 'Di', RelationshipType.OUTGOING),
  rel('5', 'Ed', RelationshipType.BLOCKED),
];
const presence = { '1': { status: 'online' }, '2': { status: 'dnd' } };

const names = (list: ReturnType<typeof friendsList>) => list.entries.map((e) => (e.kind === 'heading' ? e.title : e.name));

describe('friendsList', () => {
  it('shows who is online with a presence label and counts every tab', () => {
    const list = friendsList(all, presence, 'online', '');
    expect(names(list)).toEqual(['Online - 2', 'Alpha', 'Bea']);
    expect(list.entries[1]).toMatchObject({ subtitle: 'Do not disturb', status: 'dnd' });
    expect(list.counts).toEqual({ online: 2, all: 2, pending: 2, blocked: 1 });
  });

  it('puts offline friends only under All', () => {
    expect(names(friendsList(all, { '1': { status: 'online' } }, 'online', ''))).toEqual(['Online - 1', 'Bea']);
    const list = friendsList(all, { '1': { status: 'online' } }, 'all', '');
    expect(names(list)).toEqual(['All friends - 2', 'Alpha', 'Bea']);
    expect(list.entries[1]).toMatchObject({ subtitle: 'Offline' });
  });

  it('splits pending into incoming and outgoing, without presence dots', () => {
    const list = friendsList(all, presence, 'pending', '');
    expect(names(list)).toEqual(['Incoming - 1', 'Cy', 'Outgoing - 1', 'Di']);
    expect(list.entries.filter((e) => e.kind === 'item').map((e) => (e.kind === 'item' ? [e.subtitle, e.status] : []))).toEqual([
      ['Incoming friend request', null],
      ['Outgoing friend request', null],
    ]);
  });

  it('lists the blocked', () => {
    expect(friendsList(all, presence, 'blocked', '').entries[1]).toMatchObject({ name: 'Ed', subtitle: 'Blocked' });
  });

  it('searches names and nicknames but keeps the tab counts of the whole list', () => {
    const list = friendsList(all, presence, 'all', 'alph');
    expect(names(list)).toEqual(['All friends - 1', 'Alpha']);
    expect(list.counts.all).toBe(2);
  });

  it('says why a tab is empty', () => {
    expect(emptyFriendsText('online', '')).toMatch(/online/);
    expect(emptyFriendsText('pending', '')).toMatch(/pending/);
    expect(emptyFriendsText('blocked', '')).toMatch(/blocked/i);
    expect(emptyFriendsText('all', '')).toMatch(/Add someone/);
    expect(emptyFriendsText('all', 'zzz')).toMatch(/matches/);
  });
});
