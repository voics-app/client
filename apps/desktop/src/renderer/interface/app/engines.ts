/** Composition root for the media engines: builds the voice controller and Watch Together service
 * once per app start, wires them to the runtime's gateway hooks and exposes them to the UI through
 * the voice facade. UI code never constructs engine classes itself. */
import type { VoiceController } from '@renderer/application/voice/voiceController';
import type { WatchTogetherService } from '@renderer/application/watch/watchTogetherService';
import { createVoiceController, createWatchTogetherService } from '@renderer/infrastructure/voice/browserVoice';
import type { Runtime } from './runtime';
import { registerVoice, type ShareResult, type VoiceFacade } from './voiceActions';

export interface Engines {
  voice: VoiceController;
  watch: WatchTogetherService;
}

let engines: Engines | null = null;

export function getEngines(): Engines | null {
  return engines;
}

export function registerEngines(runtime: Runtime): Engines {
  if (engines) return engines;

  const voice = createVoiceController({
    gateway: runtime.gateway,
    platform: runtime.info.platform,
    identityKeysOf: async (userId) => (await runtime.api.listUserDevices(userId)).map((d) => d.identity_key_b64),
  });
  const watch = createWatchTogetherService(runtime.gateway);

  runtime.hooks.onVoiceServerUpdate = (update) => voice.onVoiceServerUpdate(update);
  runtime.hooks.onSignedOut.push(() => {
    void voice.leave();
    watch.detach();
  });

  registerVoice(toFacade(voice));
  engines = { voice, watch };
  return engines;
}

function toFacade(voice: VoiceController): VoiceFacade {
  return {
    join: (guildId, channelId) => voice.join({ guildId, channelId }),
    leave: () => voice.leave(),
    setMute: async (muted) => voice.setMute(muted),
    setDeaf: async (deafened) => voice.setDeaf(deafened),
    setCamera: (enabled) => voice.setVideo(enabled),
    startScreenShare: async (options): Promise<ShareResult> => {
      const outcome = await voice.startScreenShare(options);
      return outcome.status === 'sharing' ? { ok: true } : { ok: false, reason: 'protected_content' };
    },
    stopScreenShare: () => voice.stopScreenShare(),
    setScreenPreset: (preset) => voice.setScreenPreset(preset),
    setUserVolume: (userId, volume) => voice.setUserVolume(userId, volume),
  };
}
