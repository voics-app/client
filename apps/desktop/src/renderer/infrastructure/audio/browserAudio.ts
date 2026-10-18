/** Browser wiring for the audio pipeline (kept apart so unit tests never import the worklet bundle). */
import { usePrefsStore } from '@renderer/application/stores/prefsStore';
import rnnoiseModuleUrl from '../../workers/rnnoiseProcessor?worker&url';
import { MicPipeline } from './micPipeline';
import { RemoteAudioMixer } from './remoteAudioMixer';

export function createBrowserMicPipeline(): MicPipeline {
  const hotkeys = window.discordy?.hotkeys;
  return new MicPipeline({
    prefs: () => usePrefsStore.getState(),
    mediaDevices: navigator.mediaDevices,
    createContext: () => new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' }),
    rnnoiseModuleUrl,
    onPushToTalk: hotkeys ? (listener) => hotkeys.onPushToTalk(listener) : undefined,
    setPushToTalkKey: hotkeys ? (keycode) => hotkeys.setPushToTalk(keycode) : undefined,
  });
}

export function createBrowserMixer(): RemoteAudioMixer {
  return new RemoteAudioMixer();
}
