import { describe, expect, it } from 'vitest';
import { becameFriends, dmIntro } from '@discordy/core/domain/dmIntro';
import { ChannelType, RelationshipType, type Channel, type Relationship, type User } from '@discordy/core/contracts/rest';

const ada: User = { id: '2', username: 'ada', global_name: 'Ada L', avatar: null };
const rel = (type: Relationship['type']): Relationship => ({ id: '2', type, user: ada });
const dm = (extra: Partial<Channel> = {}): Channel => ({ id: '9', type: ChannelType.DM, recipients: [ada], ...extra }) as Channel;
const nameOf = (u: User) => u.global_name ?? u.username;

describe('becameFriends', () => {
  it('is true when an incoming or outgoing request is accepted', () => {
    expect(becameFriends(rel(RelationshipType.INCOMING), rel(RelationshipType.FRIEND))).toBe(true);
    expect(becameFriends(rel(RelationshipType.OUTGOING), rel(RelationshipType.FRIEND))).toBe(true);
    expect(becameFriends(undefined, rel(RelationshipType.FRIEND))).toBe(true);
  });
  it('is false for a repeat of the friendship and for non-friend types', () => {
    expect(becameFriends(rel(RelationshipType.FRIEND), rel(RelationshipType.FRIEND))).toBe(false);
    expect(becameFriends(undefined, rel(RelationshipType.INCOMING))).toBe(false);
    expect(becameFriends(rel(RelationshipType.FRIEND), rel(RelationshipType.BLOCKED))).toBe(false);
  });
});

describe('dmIntro', () => {
  it('describes a 1:1 DM and offers the wave only when empty', () => {
    const intro = dmIntro(dm(), true, nameOf)!;
    expect(intro).toMatchObject({ name: 'Ada L', username: 'ada', canWave: true, text: 'This is the beginning of your direct message history with @ada.' });
    expect(dmIntro(dm(), false, nameOf)!.canWave).toBe(false);
  });
  it('is null for group DMs, guild channels and unknown channels', () => {
    expect(dmIntro(dm({ type: ChannelType.GROUP_DM, recipients: [ada, { ...ada, id: '3' }] }), true, nameOf)).toBeNull();
    expect(dmIntro(dm({ guild_id: '1' }), true, nameOf)).toBeNull();
    expect(dmIntro(undefined, true, nameOf)).toBeNull();
  });
});
