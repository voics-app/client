import type { GuildMeta } from '@discordy/core/application/stores/guildStore';
import { ChannelType, type Channel, type GuildMember, type User, type VoiceState } from '@discordy/core/contracts/rest';
import { callHeadline, participantRows, voiceChannelRows } from '../../src/voice/voiceModel';

const user = (id: string, name: string, extra: Partial<User> = {}): User => ({ id, username: name, global_name: null, avatar: null, ...extra });
const state = (user_id: string, extra: Partial<VoiceState> = {}): VoiceState => ({
  guild_id: 'g1',
  channel_id: 'v1',
  user_id,
  session_id: 's',
  deaf: false,
  mute: false,
  self_deaf: false,
  self_mute: false,
  self_video: false,
  suppress: false,
  ...extra,
});
const member = (u: User, extra: Partial<GuildMember> = {}): GuildMember => ({ user: u, roles: [], joined_at: '', deaf: false, mute: false, ...extra });

describe('participantRows', () => {
  const members = { u1: member(user('u1', 'me')), u2: member(user('u2', 'pat', { global_name: 'Pat' }), { nick: 'Patty' }), u3: member(user('u3', 'abe')) };

  it('lists you first, then people by name, using nicknames', () => {
    const rows = participantRows({ states: [state('u3'), state('u2'), state('u1')], speaking: {}, selfId: 'u1', members });
    expect(rows.map((r) => [r.userId, r.name, r.self])).toEqual([
      ['u1', 'me', true],
      ['u3', 'abe', false],
      ['u2', 'Patty', false],
    ]);
  });

  it('marks who is speaking, but never someone who is muted', () => {
    const rows = participantRows({
      states: [state('u2'), state('u3', { self_mute: true })],
      speaking: { u2: 0.4, u3: 0.9 },
      selfId: 'u1',
      members,
    });
    expect(rows.find((r) => r.userId === 'u2')?.speaking).toBe(true);
    expect(rows.find((r) => r.userId === 'u3')).toMatchObject({ speaking: false, muted: true });
  });

  it('ignores near-silent levels', () => {
    const [row] = participantRows({ states: [state('u2')], speaking: { u2: 0.005 }, selfId: 'u1', members });
    expect(row?.speaking).toBe(false);
  });

  it('shows server mute and deafen the same as your own', () => {
    const [row] = participantRows({ states: [state('u2', { deaf: true, mute: true })], speaking: {}, selfId: 'u1', members });
    expect(row).toMatchObject({ muted: true, deafened: true });
  });

  it('finds people in a direct message from the recipients and yourself', () => {
    const pat = user('u2', 'pat', { global_name: 'Pat' });
    const rows = participantRows({
      states: [state('u2', { guild_id: null, channel_id: 'dm1' }), state('u1', { guild_id: null, channel_id: 'dm1' })],
      speaking: {},
      selfId: 'u1',
      recipients: [pat],
      selfUser: user('u1', 'me'),
    });
    expect(rows.map((r) => r.name)).toEqual(['me', 'Pat']);
  });

  it('falls back to an unknown user when nothing names the person', () => {
    const [row] = participantRows({ states: [state('ux')], speaking: {}, selfId: 'u1' });
    expect(row?.name).toBe('Unknown user');
  });
});

describe('callHeadline', () => {
  it('says where the call is', () => {
    expect(callHeadline({ status: 'requesting', error: null, e2ee: false })).toBe('Starting');
    expect(callHeadline({ status: 'connecting', error: null, e2ee: false })).toBe('Connecting');
    expect(callHeadline({ status: 'reconnecting', error: null, e2ee: false })).toBe('Reconnecting');
    expect(callHeadline({ status: 'connected', error: null, e2ee: false })).toBe('Voice connected');
    expect(callHeadline({ status: 'connected', error: null, e2ee: true })).toBe('Voice connected, end-to-end encrypted');
    expect(callHeadline({ status: 'idle', error: null, e2ee: false })).toBe('');
  });

  it('shows why a call failed', () => {
    expect(callHeadline({ status: 'failed', error: 'The voice server did not respond', e2ee: false })).toBe('The voice server did not respond');
    expect(callHeadline({ status: 'failed', error: null, e2ee: false })).toBe('The call failed');
  });
});

describe('voiceChannelRows', () => {
  const guild = { id: 'g1', name: 'Home', owner_id: 'owner', roles: [] } as unknown as GuildMeta;
  const channel = (id: string, extra: Partial<Channel> = {}): Channel => ({ id, guild_id: 'g1', type: ChannelType.GUILD_VOICE, name: id, position: 0, ...extra }) as Channel;

  it('lists voice channels only, in the server order, with their occupants', () => {
    const channels = {
      t1: channel('t1', { type: ChannelType.GUILD_TEXT }),
      v2: channel('v2', { position: 2 }),
      v1: channel('v1', { position: 1, user_limit: 2 }),
      other: channel('other', { guild_id: 'g2' }),
    };
    const states = { u2: state('u2', { channel_id: 'v1' }), u3: state('u3', { channel_id: 'v1' }), u4: state('u4', { channel_id: 'v2' }) };
    const rows = voiceChannelRows({ guild, channels, members: undefined, userId: 'owner', states });
    expect(rows.map((r) => [r.channel.id, r.occupants])).toEqual([
      ['v1', 2],
      ['v2', 1],
    ]);
    expect(rows[0]?.capacity).toMatchObject({ label: '2/2', full: true });
  });

  it('hides a channel the user cannot see', () => {
    const channels = { v1: channel('v1', { permission_overwrites: [{ id: 'g1', type: 0, allow: '0', deny: String(1n << 10n) }] }) };
    expect(voiceChannelRows({ guild, channels, members: undefined, userId: 'someone', states: undefined })).toEqual([]);
  });
});
