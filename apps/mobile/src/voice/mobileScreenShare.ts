import type { VoiceSessionPort } from '@discordy/core/application/ports/voice';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { presetConstraints } from '@discordy/core/domain/videoPresets';
import type { NativeVideoStream } from './nativeVoice';

export interface ScreenShareDriver {
  /** Resolves only after the system has granted capture. Null means the user cancelled. */
  open(): Promise<NativeVideoStream | null>;
  cancel(): void;
}

interface ScreenShareDeps {
  driver?: ScreenShareDriver;
  session(): VoiceSessionPort | null;
  announce(): void;
  canPublish?(): boolean;
}

const SCREEN_OPTIONS = { constraints: presetConstraints('720p30'), contentHint: 'detail' as const };

/** Owns screen capture separately from the camera: going to another app is the purpose of a broadcast. */
export class MobileScreenShare {
  private held: NativeVideoStream | null = null;
  private generation = 0;
  private opening: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();
  private phase: 'idle' | 'starting' | 'sharing' = 'idle';

  constructor(private readonly deps: ScreenShareDeps) {}

  get available(): boolean { return Boolean(this.deps.driver); }
  get status(): 'idle' | 'starting' | 'sharing' { return this.phase; }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  start(): Promise<void> {
    if (this.deps.canPublish && !this.deps.canPublish()) return Promise.reject(new Error('You do not have permission to share your screen in this channel.'));
    if (this.opening) return this.opening;
    if (this.held) return Promise.resolve();
    const task = this.open(++this.generation);
    this.opening = task.finally(() => { this.opening = null; });
    return this.opening;
  }

  private async open(generation: number): Promise<void> {
    const session = this.deps.session();
    if (!session || useVoiceStore.getState().call.status !== 'connected') throw new Error('Screen sharing needs a connected call.');
    if (!this.deps.driver) throw new Error('Screen sharing is not available in this build.');
    this.setPhase('starting');
    let stream: NativeVideoStream | null = null;
    try {
      stream = await this.deps.driver.open();
      if (!stream) return;
      if (generation !== this.generation || session !== this.deps.session() || useVoiceStore.getState().call.status !== 'connected' || (this.deps.canPublish && !this.deps.canPublish())) return;
      const track = stream.getVideoTracks()[0];
      if (!track || track.readyState === 'ended') throw new Error('Screen capture ended before it could start.');
      await session.setScreenTrack(track, SCREEN_OPTIONS);
      if (generation !== this.generation || session !== this.deps.session() || (this.deps.canPublish && !this.deps.canPublish())) {
        await session.setScreenTrack(null);
        return;
      }
      this.held = stream;
      track.onended = () => { void this.stop(); };
      useVoiceStore.getState().setLocalMedia({ localScreen: stream });
      useVoiceStore.getState().setSelf({ selfStream: true });
      this.setPhase('sharing');
      this.deps.announce();
    } finally {
      if (stream !== this.held) stream?.getTracks().forEach((track) => track.stop());
      if (!this.held) {
        this.deps.driver.cancel();
        this.setPhase('idle');
      }
    }
  }

  async stop(): Promise<void> {
    this.generation += 1;
    const held = this.held;
    this.held = null;
    this.deps.driver?.cancel();
    held?.getVideoTracks().forEach((track) => { track.onended = null; });
    // End capture immediately, including when signalling or cryptor teardown is still pending.
    held?.getTracks().forEach((track) => track.stop());
    useVoiceStore.getState().setLocalMedia({ localScreen: null });
    useVoiceStore.getState().setSelf({ selfStream: false });
    this.setPhase('idle');
    this.deps.announce();
    if (held) await this.deps.session()?.setScreenTrack(null).catch(() => undefined);
  }

  async restore(session: VoiceSessionPort): Promise<void> {
    const track = this.held?.getVideoTracks()[0];
    if (track && session === this.deps.session()) {
      try { await session.setScreenTrack(track, SCREEN_OPTIONS); }
      catch { await this.stop(); }
    }
  }

  private setPhase(phase: typeof this.phase): void {
    this.phase = phase;
    for (const listener of this.listeners) listener();
  }
}
