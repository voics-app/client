/** Decodes a guild sound into a dedicated outgoing track, separate from the microphone. */
export class SoundboardPlayer {
  private readonly destination: MediaStreamAudioDestinationNode;
  private readonly track: MediaStreamTrack;
  private playing: AudioBufferSourceNode | null = null;
  private generation = 0;
  private closed = false;

  constructor(private readonly context: AudioContext) {
    this.destination = context.createMediaStreamDestination();
    const track = this.destination.stream.getAudioTracks()[0];
    if (!track) throw new Error('Soundboard audio track is unavailable');
    this.track = track;
  }

  /** Obtain before creating the WebRTC offer, so the browser allocates a separate SSRC. */
  get outgoingTrack(): MediaStreamTrack { return this.track; }

  async play(data: ArrayBuffer, volume: number): Promise<void> {
    if (this.closed) throw new Error('Soundboard is closed');
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) throw new Error('Invalid sound volume');
    const generation = ++this.generation;
    await this.context.resume();
    const buffer = await this.context.decodeAudioData(data.slice(0));
    if (this.closed || generation !== this.generation) return;
    this.playing?.stop();
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(this.destination);
    this.playing = source;
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      if (this.playing === source) this.playing = null;
    };
    source.start();
  }

  stop(): void {
    this.generation += 1;
    this.playing?.stop();
    this.playing = null;
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.stop();
    this.track.stop();
    void this.context.close();
  }
}
