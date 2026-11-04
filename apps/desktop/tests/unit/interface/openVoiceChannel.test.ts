import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { ChannelType, type Channel } from '@discordy/core/contracts/rest';
import { openVoiceChannel, registerVoice, type VoiceFacade } from '@renderer/interface/app/voiceActions';

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
