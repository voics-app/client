/**
 * Plays remote voice through Web Audio so every participant has an individual
 * gain (0-200 %), with a master output volume, deafen, and output device
 * selection. A muted <audio> element is attached to each remote stream because
 * Chromium only pumps WebRTC audio into Web Audio when a media element consumes it.
 */
import type { MixerPort } from '@renderer/application/voice/ports';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';

interface Voice {
  element: HTMLAudioElement;
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
}

export interface MixerDeps {
  createContext(): AudioContext;
  createElement(): HTMLAudioElement;
}

export const browserMixerDeps: MixerDeps = {
  createContext: () => new AudioContext({ latencyHint: 'interactive' }),
  createElement: () => new Audio(),
};

export class RemoteAudioMixer implements MixerPort {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly voices = new Map<string, Voice>();
  private readonly volumes = new Map<string, number>();
  private masterVolume = 1;
  private deafened = false;
  private outputDeviceId: string | null = null;
  private readonly soundboardUsers = new Set<string>();
  private readonly unsubscribeSoundboardPrefs = usePrefsStore.subscribe((next, previous) => {
    if (next.soundboardVolume === previous.soundboardVolume && next.soundboardMuted === previous.soundboardMuted) return;
    for (const userId of this.soundboardUsers) this.applySoundboardVolume(userId);
  });

  constructor(private readonly deps: MixerDeps = browserMixerDeps) {}

  private ensure(): { context: AudioContext; master: GainNode } {
    if (!this.context || !this.master) {
      this.context = this.deps.createContext();
      this.master = this.context.createGain();
      this.master.connect(this.context.destination);
      this.applyMaster();
      this.resumeOnGesture(this.context);
      if (this.outputDeviceId) void this.context.setSinkId?.(this.outputDeviceId).catch(() => undefined);
    }
    return { context: this.context, master: this.master };
  }

  /** A context created before the first user gesture starts suspended (silent); resume it on the next one. */
  private resumeOnGesture(context: AudioContext): void {
    if (typeof document === 'undefined' || context.state === 'running') return;
    const resume = (): void => {
      if (context.state === 'running' || context.state === 'closed') {
        for (const type of ['pointerdown', 'keydown']) document.removeEventListener(type, resume, true);
        return;
      }
      void context.resume().catch(() => undefined);
    };
    for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, resume, true);
  }

  private applyMaster(): void {
    if (this.master) this.master.gain.value = this.deafened ? 0 : this.masterVolume;
  }

  setStream(userId: string, stream: MediaStream | null): void {
    const existing = this.voices.get(userId);
    if (existing) {
      existing.source.disconnect();
      existing.element.srcObject = null;
      this.voices.delete(userId);
    }
    if (!stream) return;
    const { context, master } = this.ensure();
    const element = this.deps.createElement();
    element.srcObject = stream;
    element.muted = true;
    void element.play?.().catch(() => undefined);
    const source = context.createMediaStreamSource(stream);
    const gain = context.createGain();
    gain.gain.value = this.volumes.get(userId) ?? 1;
    source.connect(gain);
    gain.connect(master);
    this.voices.set(userId, { element, source, gain });
    if (context.state === 'suspended') void context.resume();
  }

  /** Uses a separate gain so muting soundboard never silences the microphone. */
  setSoundboardStream(userId: string, stream: MediaStream | null): void {
    if (stream) this.soundboardUsers.add(userId);
    else this.soundboardUsers.delete(userId);
    const key = `soundboard:${userId}`;
    this.setStream(key, stream);
    if (stream) this.applySoundboardVolume(userId);
  }

  private applySoundboardVolume(userId: string): void {
    const prefs = usePrefsStore.getState();
    const userVolume = this.volumes.get(userId) ?? 1;
    this.setChannelVolume(`soundboard:${userId}`, prefs.soundboardMuted ? 0 : prefs.soundboardVolume * userVolume);
  }

  private setChannelVolume(key: string, volume: number): void {
    const clamped = Math.max(0, Math.min(2, volume));
    this.volumes.set(key, clamped);
    const voice = this.voices.get(key);
    if (voice) voice.gain.gain.value = clamped;
  }

  setUserVolume(userId: string, volume: number): void {
    this.setChannelVolume(userId, volume);
    if (this.soundboardUsers.has(userId)) this.applySoundboardVolume(userId);
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(2, volume));
    this.applyMaster();
  }

  setDeafened(deafened: boolean): void {
    this.deafened = deafened;
    this.applyMaster();
  }

  async setOutputDevice(deviceId: string | null): Promise<void> {
    this.outputDeviceId = deviceId;
    if (this.context?.setSinkId) await this.context.setSinkId(deviceId ?? '');
  }

  dispose(): void {
    this.unsubscribeSoundboardPrefs();
    this.soundboardUsers.clear();
    for (const userId of [...this.voices.keys()]) this.setStream(userId, null);
    void this.context?.close();
    this.context = null;
    this.master = null;
  }
}
