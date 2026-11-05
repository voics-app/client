import { describe, expect, it } from 'vitest';
import { ChannelType, type Channel, type GuildMember, type User } from '@discordy/core/contracts/rest';
import { searchCandidates } from '@discordy/core/domain/searchCandidates';

const user = (id: string, username: string, global_name: string | null = null): User => ({ id, username, global_name, avatar: null });
const channel = (id: string, extra: Partial<Channel> = {}) => ({ id, type: ChannelType.GUILD_TEXT, guild_id: 'g1', name: id, ...extra }) as Channel;
const shown = (u: Pick<User, 'username' | 'global_name'>, nick?: string | null) => nick || u.global_name || u.username;

describe('searchCandidates', () => {
  it('offers server members by username and by the name shown, and only text channels of that server', () => {
    const members = { u2: { user: user('u2', 'pat', 'Pat'), roles: [] } as unknown as GuildMember, u3: { user: user('u3', 'sam'), nick: 'Sammy', roles: [] } as unknown as GuildMember };
    const result = searchCandidates({
      channel: channel('general'),
      members,
      channels: [channel('general'), channel('news', { type: ChannelType.GUILD_ANNOUNCEMENT }), channel('lobby', { type: ChannelType.GUILD_VOICE }), channel('other', { guild_id: 'g2' })],
      me: null,
      displayName: shown,
    });
    expect(result.users).toEqual([
      { id: 'u2', name: 'pat' },
      { id: 'u2', name: 'Pat' },
      { id: 'u3', name: 'sam' },
      { id: 'u3', name: 'Sammy' },
    ]);
    expect(result.channels.map((c) => c.id)).toEqual(['general', 'news']);
  });

  it('offers you and the other people in a direct message, and no channels', () => {
    const dm = { id: 'd1', type: ChannelType.DM, guild_id: null, recipients: [user('u2', 'pat')] } as unknown as Channel;
    const result = searchCandidates({ channel: dm, members: undefined, channels: [channel('general')], me: user('u1', 'me'), displayName: shown });
    expect(result).toEqual({ users: [{ id: 'u2', name: 'pat' }, { id: 'u1', name: 'me' }], channels: [] });
  });
});
