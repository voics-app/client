import type { MicPort } from '@discordy/core/application/ports/voice';
import type { NativeAudioTrack } from './nativeVoice';
import { createActivityGate, type ActivityGate } from './voiceActivity';

/**
 * The microphone on a phone. Muting turns the track off (silence is sent). There is no audio graph to read levels from, so
 * the voice session feeds the level of the outgoing audio from the peer connection stats (`feedLevel`).
 */
export class MobileMic implements MicPort {
  private track: NativeAudioTrack | null = null;
  private muted = false;
  private forcePtt = false;
  private pressed = false;
  private readonly listeners = new Set<(level: number, transmitting: boolean) => void>();

  constructor(
    private readonly open: () => Promise<NativeAudioTrack>,
    private readonly gate: ActivityGate = createActivityGate(),
    private readonly now: () => number = Date.now,
  ) {}

  async start(): Promise<NativeAudioTrack> {
    const track = await this.open();
    track.enabled = !this.muted && (!this.forcePtt || this.pressed);
    this.track = track;
    return track;
  }

  stop(): void {
    this.track?.stop();
    this.track = null;
    this.pressed = false;
    this.gate.reset();
    this.emit(0, false);
  }

  setSelfMute(muted: boolean): void {
    this.muted = muted;
    if (this.track) this.track.enabled = !muted && (!this.forcePtt || this.pressed);
    if (muted) {
      this.gate.reset();
      this.emit(0, false);
    }
  }

  setForcePushToTalk(forced: boolean): void {
    if (this.forcePtt === forced) return;
    this.forcePtt = forced;
    this.pressed = false;
    this.updateGate();
  }

  setPushToTalk(pressed: boolean): void {
    this.pressed = pressed;
    this.updateGate();
  }

  private updateGate(): void {
    const enabled = !this.muted && (!this.forcePtt || this.pressed);
    if (this.track) this.track.enabled = enabled;
    if (!enabled) {
      this.gate.reset();
      this.emit(0, false);
    }
  }

  onLevel(listener: (level: number, transmitting: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** The level of what is being sent, 0 to 1. Ignored while muted or without a track. */
  feedLevel(level: number): void {
    if (this.muted || !this.track || (this.forcePtt && !this.pressed)) return;
    this.emit(level, this.gate.update(level, this.now()));
  }

  private emit(level: number, transmitting: boolean): void {
    for (const listener of this.listeners) listener(level, transmitting);
  }
}
