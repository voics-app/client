import { ChannelType, type Channel } from '@discordy/core/contracts/rest';
import { channelRowView } from '../../src/servers/channelRowModel';
import { channelScreenKind, EPHEMERAL_MESSAGE, FORUM_MESSAGE, P2P_MESSAGE } from '../../src/servers/channelScreenKind';

const channel = (type: number, extra: Partial<Channel> = {}) => ({ id: 'c1', type, guild_id: 'g1', name: 'room', delivery_mode: 'standard', ...extra }) as Channel;

describe('channelRowView', () => {
  it('gives each kind the desktop icon', () => {
    expect(channelRowView(channel(ChannelType.GUILD_TEXT), 0, false).glyph).toBeNull();
    expect(channelRowView(channel(ChannelType.GUILD_VOICE), 0, false).glyph).toBe('volume-high');
    expect(channelRowView(channel(ChannelType.GUILD_STAGE_VOICE), 0, false).glyph).toBe('volume-high');
    expect(channelRowView(channel(ChannelType.GUILD_ANNOUNCEMENT), 0, false).glyph).toBe('megaphone-outline');
    expect(channelRowView(channel(ChannelType.GUILD_FORUM), 0, false).glyph).toBe('chatbubbles-outline');
  });

  it('marks ephemeral, peer-to-peer, private and age-restricted channels', () => {
    expect(channelRowView(channel(ChannelType.GUILD_TEXT, { delivery_mode: 'ephemeral' }), 0, false)).toMatchObject({ ephemeral: true, p2p: false });
    expect(channelRowView(channel(ChannelType.GUILD_TEXT, { delivery_mode: 'p2p' }), 0, false)).toMatchObject({ ephemeral: false, p2p: true });
    expect(channelRowView(channel(ChannelType.GUILD_TEXT, { nsfw: true }), 0, false).nsfw).toBe(true);
    const hidden = channel(ChannelType.GUILD_TEXT, { permission_overwrites: [{ id: 'g1', type: 0, allow: '0', deny: String(1n << 10n) }] });
    expect(channelRowView(hidden, 0, false).private).toBe(true);
  });

  it('shows capacity on voice channels with a user limit, and blocks a full one for people who cannot move members', () => {
    const voice = channel(ChannelType.GUILD_VOICE, { user_limit: 2 });
    expect(channelRowView(voice, 1, false).capacity).toMatchObject({ label: '1/2', full: false });
    expect(channelRowView(voice, 2, false).capacity).toMatchObject({ label: '2/2', full: true, joinBlocked: true });
    expect(channelRowView(voice, 2, true).capacity?.joinBlocked).toBe(false);
    expect(channelRowView(channel(ChannelType.GUILD_VOICE), 3, false).capacity).toBeNull();
  });

  it('labels rows for assistive technology', () => {
    expect(channelRowView(channel(ChannelType.GUILD_TEXT), 0, false).label).toBe('Open #room');
    expect(channelRowView(channel(ChannelType.GUILD_VOICE), 0, false).label).toBe('Open voice channel room');
  });
});

describe('channelScreenKind', () => {
  it('opens voice and stage channels on the voice screen', () => {
    expect(channelScreenKind(channel(ChannelType.GUILD_VOICE))).toEqual({ screen: 'voice' });
    expect(channelScreenKind(channel(ChannelType.GUILD_STAGE_VOICE))).toEqual({ screen: 'voice' });
  });

  it('explains ephemeral, peer-to-peer and forum channels instead of opening them', () => {
    expect(channelScreenKind(channel(ChannelType.GUILD_TEXT, { delivery_mode: 'ephemeral' }))).toEqual({ screen: 'unsupported', message: EPHEMERAL_MESSAGE });
    expect(channelScreenKind(channel(ChannelType.GUILD_TEXT, { delivery_mode: 'p2p' }))).toEqual({ screen: 'unsupported', message: P2P_MESSAGE });
    expect(channelScreenKind(channel(ChannelType.GUILD_FORUM))).toEqual({ screen: 'unsupported', message: FORUM_MESSAGE });
  });

  it('opens standard text and announcement channels as chat, and an unknown channel as chat too', () => {
    expect(channelScreenKind(channel(ChannelType.GUILD_TEXT))).toEqual({ screen: 'chat' });
    expect(channelScreenKind(channel(ChannelType.GUILD_ANNOUNCEMENT))).toEqual({ screen: 'chat' });
    expect(channelScreenKind(undefined)).toEqual({ screen: 'chat' });
  });
});
