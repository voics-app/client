import { ChannelType, type Channel, type Relationship, type User } from '@discordy/core/contracts/rest';
import { composerPlaceholder } from '../../src/messages/composerPlaceholder';

const BOB: User = { id: 'u2', username: 'bob', global_name: null, avatar: null };
const SAM: User = { id: 'u3', username: 'sam', global_name: null, avatar: null };
const ch = (extra: Partial<Channel>) => ({ id: 'c', type: ChannelType.GUILD_TEXT, ...extra }) as Channel;

describe('composerPlaceholder', () => {
  it('names a server channel with a hash', () => {
    expect(composerPlaceholder(ch({ guild_id: 'g', name: 'general' }), {})).toBe('Message #general');
  });

  it('names the other person in a 1:1 DM, using their nickname when a friend', () => {
    const dm = ch({ type: ChannelType.DM, recipients: [BOB] });
    expect(composerPlaceholder(dm, {})).toBe('Message @bob');
    const nick = { u2: { id: 'u2', nickname: 'Bobby', user: BOB } as unknown as Relationship };
    expect(composerPlaceholder(dm, nick)).toBe('Message @Bobby');
  });

  it('says group for a group conversation and falls back while the channel loads', () => {
    expect(composerPlaceholder(ch({ type: ChannelType.GROUP_DM, recipients: [BOB, SAM] }), {})).toBe('Message group');
    expect(composerPlaceholder(undefined, {})).toBe('Message');
  });
});
