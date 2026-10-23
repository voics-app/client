import { describe, expect, it } from 'vitest';
import { activeNow, buildFriendsView } from '@renderer/domain/friendsModel';
import { RelationshipType, type Relationship, type VoiceState } from '@shared/contracts/rest';

const rel = (id: string, type: number, username: string, extra: Partial<Relationship> = {}): Relationship =>
  ({ id, type: type as Relationship['type'], user: { id, username, global_name: null, avatar: null }, ...extra });

const all = [
  rel('1', RelationshipType.FRIEND, 'zed'),
  rel('2', RelationshipType.FRIEND, 'amy', { nickname: 'Bestie' }),
  rel('3', RelationshipType.INCOMING, 'in1'),
  rel('4', RelationshipType.OUTGOING, 'out1'),
  rel('5', RelationshipType.BLOCKED, 'bad'),
];

describe('buildFriendsView', () => {
  it('splits relationships and sorts friends by display name', () => {
    const v = buildFriendsView(all, { '1': { status: 'online' } });
    expect(v.friends.map((r) => r.id)).toEqual(['2', '1']);
    expect(v.online.map((r) => r.id)).toEqual(['1']);
    expect(v.incoming.map((r) => r.id)).toEqual(['3']);
    expect(v.outgoing.map((r) => r.id)).toEqual(['4']);
    expect(v.blocked.map((r) => r.id)).toEqual(['5']);
  });

  it('searches nickname and username case-insensitively', () => {
    expect(buildFriendsView(all, {}, 'BEST').friends.map((r) => r.id)).toEqual(['2']);
    expect(buildFriendsView(all, {}, 'ze').friends.map((r) => r.id)).toEqual(['1']);
    expect(buildFriendsView(all, {}, 'out').outgoing).toHaveLength(1);
  });
});

describe('activeNow', () => {
  const vs = (user_id: string, channel_id: string | null): VoiceState => ({ user_id, channel_id, guild_id: 'g' }) as VoiceState;
  it('lists friends in voice before friends playing, skipping idle ones', () => {
    const friends = buildFriendsView(all, {}).friends;
    const out = activeNow(friends, { g: { '1': vs('1', 'c1') } }, { '2': { status: 'online', activities: [{ type: 0, name: 'Chess' }] } });
    expect(out.map((e) => [e.rel.id, e.kind, e.detail])).toEqual([['1', 'voice', 'c1'], ['2', 'playing', 'Chess']]);
    expect(activeNow(friends, { g: { '1': vs('1', null) } }, {})).toEqual([]);
  });
});

import { friendRequestError } from '@renderer/domain/friendsModel';
describe('friendRequestError', () => {
  it('explains the common failures', () => {
    expect(friendRequestError(404, 'Unknown User', 'ghost')).toContain('could not find anyone named "ghost"');
    expect(friendRequestError(403, '', 'bob')).toContain('not accepting');
    expect(friendRequestError(0, '', 'x')).toContain('offline');
    expect(friendRequestError(400, 'Cannot befriend yourself', 'me')).toContain('yourself');
    expect(friendRequestError(500, 'boom', 'x')).toBe('boom');
  });
});
