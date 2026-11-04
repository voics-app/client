import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { useCallStore } from '@renderer/application/stores/callStore';
import { usePrefsStore } from '@renderer/application/stores/prefsStore';
import { ChannelType, type Channel } from '@discordy/core/contracts/rest';
import { startDmCall } from '@renderer/interface/app/callActions';
import { registerVoice, type VoiceFacade } from '@renderer/interface/app/voiceActions';

const dm = { id: 'dm1', type: ChannelType.DM, name: null, recipients: [{ id: 'u2', username: 'ada', global_name: 'Ada' }] } as unknown as Channel;

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

describe('startDmCall confirmation', () => {
  let voice: VoiceFacade;

  beforeEach(() => {
    voice = fakeVoice();
    registerVoice(voice);
    useGuildStore.setState({ channels: { dm1: dm } });
    useCallStore.setState({ calls: {} });
    useUiStore.setState({ dialog: null });
    usePrefsStore.setState({ confirmCalls: true });
  });

  it('asks first and rings only after confirming', async () => {
    await startDmCall('dm1');
    expect(voice.join).not.toHaveBeenCalled();
    const dialog = useUiStore.getState().dialog;
    expect(dialog).toMatchObject({ kind: 'confirm', title: 'Start a voice call?', body: 'Start a voice call with Ada? They will be rung.' });
    if (dialog?.kind === 'confirm') await dialog.onConfirm();
    expect(voice.join).toHaveBeenCalledWith(null, 'dm1');
  });

  it('starts straight away when the setting is off', async () => {
    usePrefsStore.setState({ confirmCalls: false });
    await startDmCall('dm1');
    expect(useUiStore.getState().dialog).toBeNull();
    expect(voice.join).toHaveBeenCalledWith(null, 'dm1');
  });

  it('joins a call that is already running without asking', async () => {
    useCallStore.setState({ calls: { dm1: { channelId: 'dm1', region: 'r', ringing: [], voiceStates: [{ user_id: 'u2', channel_id: 'dm1' } as never] } } });
    await startDmCall('dm1');
    expect(useUiStore.getState().dialog).toBeNull();
    expect(voice.join).toHaveBeenCalled();
  });
});
