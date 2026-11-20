import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { ChannelType, type Channel } from '@discordy/core/contracts/rest';
import { joinStageAudience, openVoiceChannel, registerVoice, toggleMute, type VoiceFacade } from '@renderer/interface/app/voiceActions';

const voiceChannel = { id: 'vc1', guild_id: 'g1', type: ChannelType.GUILD_VOICE, name: 'Lounge' } as unknown as Channel;

function fakeVoice(): VoiceFacade {
  return {
    join: vi.fn(async () => undefined),
    leave: vi.fn(async () => undefined),
    setMute: vi.fn(async () => undefined),
    setDeaf: vi.fn(async () => undefined),
    setCamera: vi.fn(async () => undefined),
    startScreenShare: vi.fn(async () => ({ ok: true as const })),
    stopScreenShare: vi.fn(async () => undefined),
    setScreenPreset: vi.fn(async () => undefined),
    setUserVolume: vi.fn(),
  };
}

describe('openVoiceChannel', () => {
  let voice: VoiceFacade;

  beforeEach(() => {
    voice = fakeVoice();
    registerVoice(voice);
    useGuildStore.setState({ channels: { vc1: voiceChannel } });
    useUiStore.setState({ view: { kind: 'home', channelId: null } });
  });

  it('joins the channel and switches the stage to it in one click', async () => {
    await openVoiceChannel('g1', 'vc1');
    expect(voice.join).toHaveBeenCalledWith('g1', 'vc1');
    expect(useUiStore.getState().view).toEqual({ kind: 'guild', guildId: 'g1', channelId: 'vc1' });
  });

  it('opens a stage without joining audio while enforcement is unavailable', async () => {
    useGuildStore.setState({ channels: { stage: { ...voiceChannel, id: 'stage', type: ChannelType.GUILD_STAGE_VOICE } } });
    await openVoiceChannel('g1', 'stage');
    expect(voice.join).not.toHaveBeenCalled();
    expect(useUiStore.getState().view).toEqual({ kind: 'guild', guildId: 'g1', channelId: 'stage' });
  });

  it('mutes capture before joining a stage as audience', async () => {
    useGuildStore.setState({ channels: { stage: { ...voiceChannel, id: 'stage', type: ChannelType.GUILD_STAGE_VOICE } } });
    await joinStageAudience('g1', 'stage');
    expect(voice.setMute).toHaveBeenCalledWith(true);
    expect(voice.join).toHaveBeenCalledWith('g1', 'stage');
    expect(vi.mocked(voice.setMute).mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(voice.join).mock.invocationCallOrder[0]!);
  });

  it('does not unmute a stage audience member without an unsuppressed voice state', async () => {
    useGuildStore.setState({ channels: { stage: { ...voiceChannel, id: 'stage', type: ChannelType.GUILD_STAGE_VOICE } } });
    useVoiceStore.setState({ selfMute: true, call: { ...useVoiceStore.getState().call, guildId: 'g1', channelId: 'stage', status: 'connected' } });
    await toggleMute();
    expect(voice.setMute).not.toHaveBeenCalled();
    useVoiceStore.getState().resetCall();
    useVoiceStore.setState({ selfMute: false });
  });

  it('only reopens the call view when clicked again while already connected', async () => {
    await openVoiceChannel('g1', 'vc1');
    useUiStore.setState({ view: { kind: 'home', channelId: null } });
    await openVoiceChannel('g1', 'vc1');
    expect(useUiStore.getState().view).toEqual({ kind: 'guild', guildId: 'g1', channelId: 'vc1' });
  });

  it('leaves the view unchanged when the channel is unknown', async () => {
    useGuildStore.setState({ channels: {} });
    await openVoiceChannel('g1', 'missing');
    expect(useUiStore.getState().view).toEqual({ kind: 'home', channelId: null });
  });
});
