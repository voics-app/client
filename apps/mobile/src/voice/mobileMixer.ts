import type { MediaStreamLike } from '@discordy/core/application/ports/media';
import type { MixerPort } from '@discordy/core/application/ports/voice';
import type { NativeAudioStream } from './nativeVoice';

/**
 * Remote voices. react-native-webrtc plays a received audio track on its own, so the mixer only shapes it:
 * deafening switches every remote track off, and a person's volume is the gain of their track.
 */
export class MobileMixer implements MixerPort {
  private readonly streams = new Map<string, NativeAudioStream>();
  private readonly volumes = new Map<string, number>();
  private master = 1;
  private deafened = false;

  setStream(userId: string, stream: MediaStreamLike | null): void {
    if (stream) {
      this.streams.set(userId, stream as NativeAudioStream);
      this.apply(userId);
    } else {
      this.streams.delete(userId);
    }
  }

  setUserVolume(userId: string, volume: number): void {
    this.volumes.set(userId, volume);
    this.apply(userId);
  }

  setMasterVolume(volume: number): void {
    this.master = volume;
    for (const userId of this.streams.keys()) this.apply(userId);
  }

  setDeafened(deafened: boolean): void {
    this.deafened = deafened;
    for (const userId of this.streams.keys()) this.apply(userId);
  }

  /** Phones have one output; the speaker or earpiece choice is the audio route. */
  async setOutputDevice(): Promise<void> {}

  dispose(): void {
    this.streams.clear();
    this.volumes.clear();
  }

  private apply(userId: string): void {
    const tracks = this.streams.get(userId)?.getAudioTracks() ?? [];
    const gain = this.volumes.get(userId) ?? 1;
    for (const track of tracks) {
      track.enabled = !this.deafened;
      track._setVolume?.(this.deafened ? 0 : gain * this.master);
    }
  }
}
