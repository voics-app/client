/** Coordinates an authorized sound with the current voice session. */
export interface SoundboardCall {
  sessionId: string;
  channelId: string;
  canPublish: boolean;
  /** False until the media cryptor and keys are ready in an E2EE call. */
  mediaReady: boolean;
}
export interface SoundboardPlaybackDeps {
  call(): SoundboardCall | null;
  authorize(channelId: string, sourceGuildId: string, soundId: string): Promise<void>;
  fetchAudio(sourceGuildId: string, soundId: string): Promise<ArrayBuffer>;
  play(data: ArrayBuffer, volume: number): Promise<void>;
  stop(): void;
}

/** A change of call or authorization invalidates pending fetch/decode and stops active audio. */
export class SoundboardPlayback {
  private generation = 0;
  constructor(private readonly deps: SoundboardPlaybackDeps) {}

  async play(sourceGuildId: string, soundId: string, volume: number): Promise<void> {
    const call = this.requireCall();
    const generation = ++this.generation;
    await this.deps.authorize(call.channelId, sourceGuildId, soundId);
    this.check(call, generation);
    const audio = await this.deps.fetchAudio(sourceGuildId, soundId);
    this.check(call, generation);
    await this.deps.play(audio, volume);
    this.check(call, generation);
  }

  /** Call on leave, move, permission/capability change, or loss of E2EE readiness. */
  cancel(): void {
    this.generation += 1;
    this.deps.stop();
  }

  private requireCall(): SoundboardCall {
    const call = this.deps.call();
    if (!call || !call.canPublish || !call.mediaReady) throw new Error('Soundboard is unavailable in this call.');
    return { ...call };
  }

  private check(original: SoundboardCall, generation: number): void {
    const current = this.deps.call();
    if (generation !== this.generation) throw new Error('The soundboard request was superseded.');
    if (!current || !current.canPublish || !current.mediaReady || current.sessionId !== original.sessionId || current.channelId !== original.channelId) {
      this.deps.stop();
      throw new Error('The voice session or soundboard permission changed.');
    }
  }
}
