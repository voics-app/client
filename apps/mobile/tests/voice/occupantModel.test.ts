import type { GuildMember, VoiceState } from '@discordy/core/contracts/rest';
import { occupantView } from '../../src/voice/occupantModel';

const state = (extra: Partial<VoiceState> = {}): VoiceState => ({ guild_id: 'g1', channel_id: 'v1', user_id: 'u2', session_id: 's', deaf: false, mute: false, self_deaf: false, self_mute: false, self_video: false, suppress: false, ...extra });
const member = (extra: Partial<GuildMember> = {}): GuildMember => ({ user: { id: 'u2', username: 'pat', global_name: 'Pat', avatar: null }, roles: [], joined_at: '', ...extra }) as GuildMember;

describe('occupantView', () => {
  it('prefers the server nickname, then the global name, then the username', () => {
    expect(occupantView(state(), member({ nick: 'Patty' })).name).toBe('Patty');
    expect(occupantView(state(), member()).name).toBe('Pat');
    expect(occupantView(state(), member({ user: { id: 'u2', username: 'pat', global_name: null, avatar: null } })).name).toBe('pat');
  });

  it('falls back to the member carried on the voice state, then to the user id', () => {
    expect(occupantView(state({ member: member() }), undefined).name).toBe('Pat');
    expect(occupantView(state(), undefined).name).toBe('u2');
  });

  it('words the mute, deafen, camera and stream flags, server ones taking priority over self ones', () => {
    const view = occupantView(state({ self_mute: true, deaf: true, self_video: true, self_stream: true }), member());
    expect(view.flags).toEqual(['Muted', 'Server deafened', 'Camera on', 'Live']);
    expect(view.marks).toEqual({ mute: 'self', deaf: 'server', camera: true, live: true });
    expect(occupantView(state(), member()).flags).toEqual([]);
  });
});
