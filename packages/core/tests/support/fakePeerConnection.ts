/** Fakes for WebRTC and sockets used by the voice tests. */
export interface FakeTransceiver {
  kind: 'audio' | 'video';
  mid: string | null;
  direction: string;
  sender: FakeSender;
  receiver: { id: string };
}

export class FakeSender {
  track: { kind: string } | null = null;
  params: { encodings: { maxBitrate?: number; maxFramerate?: number; active?: boolean }[] } = { encodings: [{}] };
  transform: unknown = null;
  constructor(public readonly kind: string) {}
  replaceTrack(track: unknown): Promise<void> {
    this.track = track as { kind: string } | null;
    return Promise.resolve();
  }
  getParameters() {
    return this.params;
  }
  setParameters(params: FakeSender['params']): Promise<void> {
    this.params = params;
    return Promise.resolve();
  }
  getStats(): Promise<Map<string, Record<string, unknown>>> {
    return Promise.resolve(new Map([['o', { type: 'outbound-rtp', ssrc: this.kind === 'video' ? 777 : 111 }]]));
  }
}

export function buildOffer(transceivers: readonly FakeTransceiver[]): string {
  const lines = ['v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0', `a=group:BUNDLE ${transceivers.map((t) => t.mid).join(' ')}`];
  for (const t of transceivers) {
    const transport = ['a=ice-ufrag:lufrag', 'a=ice-pwd:lpwd0123456789012345678', 'a=fingerprint:sha-256 AA:BB:CC', 'a=setup:actpass'];
    if (t.kind === 'audio') {
      lines.push(
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'c=IN IP4 0.0.0.0',
        ...transport,
        `a=mid:${t.mid}`,
        'a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level',
        `a=${t.direction}`,
        'a=rtpmap:111 opus/48000/2',
      );
    } else {
      lines.push(
        'm=video 9 UDP/TLS/RTP/SAVPF 98 99',
        'c=IN IP4 0.0.0.0',
        ...transport,
        `a=mid:${t.mid}`,
        `a=${t.direction}`,
        'a=rtpmap:98 VP9/90000',
        'a=rtpmap:99 rtx/90000',
        'a=fmtp:99 apt=98',
      );
    }
  }
  return `${lines.join('\r\n')}\r\n`;
}

export class FakePeerConnection {
  static instances: FakePeerConnection[] = [];
  transceivers: FakeTransceiver[] = [];
  localDescriptions: string[] = [];
  remoteDescriptions: string[] = [];
  connectionState = 'new';
  closed = false;
  ontrack: ((event: unknown) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  stats: Record<string, unknown>[] = [];

  constructor() {
    FakePeerConnection.instances.push(this);
  }

  static reset(): void {
    FakePeerConnection.instances = [];
  }

  static latest(): FakePeerConnection {
    const pc = FakePeerConnection.instances[FakePeerConnection.instances.length - 1];
    if (!pc) throw new Error('no peer connection');
    return pc;
  }

  addTransceiver(kindOrTrack: string | { kind: string }, init?: { direction?: string }): FakeTransceiver {
    const kind = (typeof kindOrTrack === 'string' ? kindOrTrack : kindOrTrack.kind) as 'audio' | 'video';
    const sender = new FakeSender(kind);
    if (typeof kindOrTrack !== 'string') sender.track = kindOrTrack;
    const t: FakeTransceiver = { kind, mid: null, direction: init?.direction ?? 'sendrecv', sender, receiver: { id: `r${this.transceivers.length}` } };
    this.transceivers.push(t);
    return t;
  }

  createOffer(): Promise<{ type: 'offer'; sdp: string }> {
    this.transceivers.forEach((t, i) => (t.mid ??= String(i)));
    return Promise.resolve({ type: 'offer', sdp: buildOffer(this.transceivers) });
  }

  setLocalDescription(description: { sdp: string }): Promise<void> {
    this.localDescriptions.push(description.sdp);
    return Promise.resolve();
  }

  setRemoteDescription(description: { sdp: string }): Promise<void> {
    this.remoteDescriptions.push(description.sdp);
    return Promise.resolve();
  }

  getStats(): Promise<Map<string, Record<string, unknown>>> {
    return Promise.resolve(new Map(this.stats.map((s, i) => [String(i), s])));
  }

  close(): void {
    this.closed = true;
  }

  setState(state: string): void {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }

  track(mid: string, stream: unknown): void {
    const transceiver = this.transceivers.find((t) => t.mid === mid)!;
    this.ontrack?.({ transceiver, receiver: transceiver.receiver, track: { kind: transceiver.kind }, streams: [stream] });
  }
}
