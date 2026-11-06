/**
 * Voice WebSocket client and WebRTC wiring for P8.
 *
 * The node never sends SDP. After READY we create the local offer, answer
 * SELECT_PROTOCOL from it, and when SESSION_DESCRIPTION arrives we synthesize
 * the remote answer (domain/sdp.ts). Additional remote sources (other users'
 * mic/camera/screen) are negotiated as extra m-sections on the same bundle.
 */
import {
  VoiceOp,
  type ClientDisconnect,
  type ClientsConnect,
  type CodecDescriptor,
  type MediaSinkWants,
  type SelectProtocol,
  type SessionDescription,
  type Speaking,
  type StreamViewers,
  type VideoPayload,
  type VoiceFrame,
  type VoiceHello,
  type VoiceIdentify,
  type VoiceReady,
} from '../../contracts/voice';
import { reconnectDelay } from '../../domain/backoff';
import { E2EE_PROTOCOL_VERSION, isE2eeVideoCodec } from '../../domain/frameFormat';
import { parseLocalOffer, synthesizeRemoteAnswer, type ParsedOffer } from '../../domain/sdp';
import { presetConstraints, type CaptureConstraints } from '../../domain/videoPresets';
import type {
  MediaPeerConnection,
  MediaStreamLike,
  MediaTrackLike,
  RtpEncodingLike,
  RtpSenderLike,
  TrackEventLike,
  TransceiverLike,
} from '../ports/media';
import type { FrameCryptorPort, MediaGroupHooks, MediaGroupSession, ScreenTrackOptions, SessionClosed, SessionStatus, VoiceSessionPort } from '../ports/voice';
import { errorMessage as errorText } from '../errorMessage';
import { useVoiceStore, type CallQuality, type MediaHandle } from '../stores/voiceStore';
import { Listeners } from '../../infrastructure/net/emitter';
import { SOCKET_OPEN, type SocketFactory, type SocketLike } from '../../infrastructure/net/socket';
import { extendAnswer, type RemoteSource, type SectionPlan, type SourceKind } from './remoteSections';
import { voiceUrl } from './voiceUrl';

export interface VoiceSessionOptions {
  endpoint: string;
  region: string | null;
  serverId: string;
  userId: string;
  sessionId: string;
  token: string;
  socketFactory: SocketFactory;
  createPeerConnection: () => MediaPeerConnection;
  /** Wraps a bare remote track when the track event carries no stream (`new MediaStream([track])`). */
  createStream: (track: MediaTrackLike) => MediaStreamLike;
  /** Present when the runtime can protect media frames; required if the node announces E2EE. */
  cryptor?: FrameCryptorPort;
  createDave?: (send: (op: number, d: unknown) => void, hooks: MediaGroupHooks) => MediaGroupSession;
  preferredVideoCodec?: string;
  statsIntervalMs?: number;
  renegotiationDelayMs?: number;
  random?: () => number;
}

const FATAL_CLOSE_CODES = new Set([4003, 4004, 4006, 4014]);
const ZOMBIE_CLOSE = 4900;

const kindOf = (source: SourceKind): 'audio' | 'video' => (source === 'audio' ? 'audio' : 'video');

export class VoiceSession implements VoiceSessionPort {
  private socket: SocketLike | null = null;
  private pc: MediaPeerConnection | null = null;
  private heartbeat: ReturnType<typeof setTimeout> | null = null;
  private acked = true;
  private attempts = 0;
  private manualClose = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private renegotiateTimer: ReturnType<typeof setTimeout> | null = null;

  private ready: VoiceReady | null = null;
  private parsedOffer: ParsedOffer | null = null;
  private offerSdp: string | null = null;
  private description: SessionDescription | null = null;
  private negotiation: Promise<void> = Promise.resolve();

  private audioTransceiver: TransceiverLike | null = null;
  private cameraTransceiver: TransceiverLike | null = null;
  private screenTransceiver: TransceiverLike | null = null;
  private micTrack: MediaTrackLike | null = null;
  private cameraTrack: MediaTrackLike | null = null;
  private screenTrack: MediaTrackLike | null = null;
  /** Senders whose frames are protected by an attached cryptor; a call that needs E2EE sends nothing else. */
  private readonly protectedSenders = new WeakSet<object>();
  private plans: SectionPlan[] = [];
  private readonly sources = new Map<string, RemoteSource>();
  private readonly transceivers = new Map<string, TransceiverLike>();
  private readonly ssrcUsers = new Map<number, string>();
  private lastBytes: { sent: number; at: number } | null = null;
  private dave: MediaGroupSession | null = null;
  private e2eeActive = false;
  private peersSeen = false;
  private earlyDave: { op: number; d: unknown }[] = [];
  private lastSpeakingFlags = 0;
  private retiredCount = 0;

  private readonly status = new Listeners<[SessionStatus]>();
  private readonly closedListeners = new Listeners<[SessionClosed]>();
  private readonly e2ee = new Listeners<[boolean]>();
  private readonly remoteAudio = new Listeners<[string, MediaStreamLike | null]>();
  private readonly localLevel = new Listeners<[number]>();
  private readonly random: () => number;

  constructor(private readonly options: VoiceSessionOptions) {
    this.random = options.random ?? Math.random;
  }

  get region(): string | null {
    return this.options.region;
  }

  onStatus(listener: (status: SessionStatus) => void): () => void {
    return this.status.add(listener);
  }
  onClosed(listener: (info: SessionClosed) => void): () => void {
    return this.closedListeners.add(listener);
  }
  onE2ee(listener: (active: boolean) => void): () => void {
    return this.e2ee.add(listener);
  }
  onRemoteAudio(listener: (userId: string, stream: MediaStreamLike | null) => void): () => void {
    return this.remoteAudio.add(listener);
  }

  /** Level (0 to 1) of the audio this device sends, read from the `media-source` stats. For platforms with no audio graph to meter the mic. */
  onLocalLevel(listener: (level: number) => void): () => void {
    return this.localLevel.add(listener);
  }

  connect(): void {
    this.manualClose = false;
    this.status.emit(this.attempts === 0 ? 'connecting' : 'reconnecting');
    const socket = this.options.socketFactory(voiceUrl(this.options.endpoint));
    this.socket = socket;
    socket.onopen = () => {
      const identify: VoiceIdentify = {
        server_id: this.options.serverId,
        user_id: this.options.userId,
        session_id: this.options.sessionId,
        token: this.options.token,
        video: true,
      };
      this.sendFrame(VoiceOp.IDENTIFY, identify);
    };
    socket.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data) as VoiceFrame;
        void this.handle(frame).catch((error: unknown) => console.error('voice frame failed', frame.op, error));
      } catch {
        // ignore undecodable frames
      }
    };
    socket.onclose = (event) => this.handleClose(socket, event.code, event.reason);
    socket.onerror = () => undefined;
  }

  close(): void {
    this.manualClose = true;
    this.teardown();
    this.socket?.close(1000);
    this.socket = null;
    this.status.emit('closed');
  }

  private teardown(): void {
    if (this.heartbeat) clearTimeout(this.heartbeat);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.statsTimer) clearInterval(this.statsTimer);
    if (this.renegotiateTimer) clearTimeout(this.renegotiateTimer);
    this.heartbeat = this.reconnectTimer = this.statsTimer = this.renegotiateTimer = null;
    this.dave?.stop();
    this.dave = null;
    this.setE2ee(false);
    this.closePeerConnection();
  }

  private closePeerConnection(): void {
    for (const source of this.sources.values()) this.dropRemote(source);
    this.pc?.close();
    this.pc = null;
    this.audioTransceiver = this.cameraTransceiver = this.screenTransceiver = null;
    this.plans = [];
    this.transceivers.clear();
    this.parsedOffer = null;
    this.offerSdp = null;
    this.description = null;
    this.negotiation = Promise.resolve();
  }

  private handleClose(socket: SocketLike, code: number, reason: string): void {
    if (socket !== this.socket || this.manualClose) return;
    this.socket = null;
    if (this.heartbeat) clearTimeout(this.heartbeat);
    this.heartbeat = null;
    if (FATAL_CLOSE_CODES.has(code)) {
      this.teardown();
      this.status.emit('closed');
      this.closedListeners.emit({ fatal: true, reason: reason || `voice closed (${code})` });
      return;
    }
    this.closePeerConnection();
    this.setE2ee(false);
    this.dave?.stop();
    this.dave = null;
    this.status.emit('reconnecting');
    this.attempts += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), reconnectDelay(this.attempts, this.random));
  }

  private fail(reason: string): void {
    this.teardown();
    this.manualClose = true;
    this.socket?.close(1000);
    this.socket = null;
    this.status.emit('closed');
    this.closedListeners.emit({ fatal: true, reason });
  }

  private sendFrame(op: number, d: unknown): void {
    if (this.socket && this.socket.readyState === SOCKET_OPEN) this.socket.send(JSON.stringify({ op, d }));
  }

  // ---- protocol -------------------------------------------------------

  private async handle(frame: VoiceFrame): Promise<void> {
    switch (frame.op) {
      case VoiceOp.HELLO:
        this.startHeartbeat((frame.d as VoiceHello).heartbeat_interval);
        return;
      case VoiceOp.HEARTBEAT_ACK:
        this.acked = true;
        return;
      case VoiceOp.READY:
        this.attempts = 0;
        await this.onReady(frame.d as VoiceReady);
        return;
      case VoiceOp.SESSION_DESCRIPTION:
        await this.onDescription(frame.d as SessionDescription);
        return;
      case VoiceOp.SPEAKING:
        this.onSpeaking(frame.d as Speaking);
        return;
      case VoiceOp.VIDEO:
        this.onVideo(frame.d as VideoPayload);
        return;
      case VoiceOp.STREAM_VIEWERS:
        this.onStreamViewers(frame.d as StreamViewers);
        return;
      case VoiceOp.CLIENTS_CONNECT:
        if ((frame.d as ClientsConnect).user_ids?.length) this.peersSeen = true;
        return;
      case VoiceOp.CLIENT_DISCONNECT:
        this.onClientDisconnect(frame.d as ClientDisconnect);
        return;
      default:
        if (frame.op >= VoiceOp.DAVE_PREPARE_TRANSITION && frame.op <= VoiceOp.DAVE_MLS_INVALID_COMMIT) {
          // The node announces the external sender (and who founds the group) right after READY, before
          // the offer/answer exchange creates the DAVE session; hold those frames instead of dropping them.
          if (this.dave) await this.dave.handleOp(frame.op, frame.d);
          else this.earlyDave.push({ op: frame.op, d: frame.d });
        }
    }
  }

  private startHeartbeat(intervalMs: number): void {
    if (this.heartbeat) clearTimeout(this.heartbeat);
    this.acked = true;
    const beat = () => {
      if (!this.acked) {
        this.socket?.close(ZOMBIE_CLOSE);
        this.handleClose(this.socket as SocketLike, ZOMBIE_CLOSE, 'heartbeat timeout');
        return;
      }
      this.acked = false;
      this.sendFrame(VoiceOp.HEARTBEAT, { t: Date.now() });
      this.heartbeat = setTimeout(beat, intervalMs);
    };
    this.heartbeat = setTimeout(beat, Math.floor(intervalMs * this.random()));
  }

  private async onReady(ready: VoiceReady): Promise<void> {
    this.ready = ready;
    const pc = this.options.createPeerConnection();
    this.pc = pc;
    pc.ontrack = (event) => this.onTrack(event);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        this.status.emit('connected');
        this.startStats();
      } else if (pc.connectionState === 'failed') {
        this.status.emit('reconnecting');
        this.socket?.close(ZOMBIE_CLOSE);
        if (this.socket) this.handleClose(this.socket, ZOMBIE_CLOSE, 'peer connection failed');
      }
    };

    this.audioTransceiver = pc.addTransceiver(this.micTrack ?? 'audio', { direction: 'sendrecv' });
    this.cameraTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
    this.screenTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });

    const offer = await pc.createOffer();
    const sdp = offer.sdp ?? '';
    await pc.setLocalDescription({ type: 'offer', sdp });
    this.offerSdp = sdp;
    this.plans = [];
    if (this.screenTransceiver.mid) this.plans.push({ mid: this.screenTransceiver.mid, role: 'local-screen' });

    const parsed = parseLocalOffer(sdp, this.options.preferredVideoCodec ?? 'VP9');
    this.parsedOffer = parsed;
    const codecs: CodecDescriptor[] = [{ name: 'opus', type: 'audio', priority: 1000, payload_type: parsed.audio.payloadType }];
    if (parsed.video) {
      codecs.push({
        name: parsed.video.codec as 'VP9' | 'AV1' | 'H264',
        type: 'video',
        priority: 1000,
        payload_type: parsed.video.payloadType,
        ...(parsed.video.rtxPayloadType !== null ? { rtx_payload_type: parsed.video.rtxPayloadType } : {}),
      });
    }
    const select: SelectProtocol = {
      protocol: 'webrtc',
      data: {
        ice_ufrag: parsed.iceUfrag,
        ice_pwd: parsed.icePwd,
        fingerprint: parsed.fingerprint,
        setup: 'actpass',
        ...(parsed.audio.ssrc
          ? {
              ssrcs: {
                audio: parsed.audio.ssrc,
                video: parsed.video?.ssrc ?? 0,
                rtx: parsed.video?.rtxSsrc ?? 0,
                screen: parsed.screen?.ssrc ?? 0,
                screen_rtx: parsed.screen?.rtxSsrc ?? 0,
              },
            }
          : {}),
      },
      codecs,
    };
    this.sendFrame(VoiceOp.SELECT_PROTOCOL, select);
  }

  private async onDescription(description: SessionDescription): Promise<void> {
    const pc = this.pc;
    if (!pc || !this.parsedOffer || !this.offerSdp) return;
    const required = description.e2ee !== null;
    const refusal = required ? this.e2eeRefusal(description) : null;
    if (refusal) {
      this.fail(refusal);
      return;
    }
    this.description = description;
    if (required && this.options.cryptor) {
      try {
        await this.protectSenders(description);
      } catch (error) {
        this.fail(`Could not protect the media this device sends: ${errorText(error)}`);
        return;
      }
    } else this.bypassSenders();
    await this.applyAnswer(this.offerSdp, this.parsedOffer, description);
    if (required) this.beginDave(description);
    if (this.sources.size > 0) this.scheduleRenegotiation();
  }

  private async applyAnswer(offerSdp: string, parsed: ParsedOffer, description: SessionDescription): Promise<void> {
    const base = synthesizeRemoteAnswer(parsed, description);
    const answer = extendAnswer(base, offerSdp, description, this.plans);
    await this.pc?.setRemoteDescription({ type: 'answer', sdp: answer });
  }

  // ---- end-to-end encryption -------------------------------------------

  private codecName(): string {
    return this.description?.video_codec ?? 'VP9';
  }

  /** Why this client must not join an E2EE call, or null. Nothing is sent or played in clear instead. */
  private e2eeRefusal(description: SessionDescription): string | null {
    const cryptor = this.options.cryptor;
    if (!cryptor?.supported) return 'This call is end-to-end encrypted but this device cannot protect media frames.';
    const version = description.e2ee?.protocol_version;
    if (version !== E2EE_PROTOCOL_VERSION) {
      return `This call uses end-to-end encryption version ${String(version)}, but this app only supports version ${E2EE_PROTOCOL_VERSION}. Update the app.`;
    }
    if (description.video_codec && !isE2eeVideoCodec(description.video_codec)) {
      return `This call negotiated ${description.video_codec} video, which cannot be end-to-end encrypted.`;
    }
    return null;
  }

  /**
   * Attaches a cryptor to every local sender before the answer is applied, which is before any media can
   * flow. A gated cryptor (react-native-webrtc) needs a track on its sender and passes clear frames until it
   * is enabled, so a sender without a track is skipped here and protected by `replaceProtected` before its first
   * track is sent. `attachSender` resolves only once the sender is confirmed protected.
   */
  private async protectSenders(description: SessionDescription): Promise<void> {
    const cryptor = this.options.cryptor;
    if (!cryptor) return;
    const codec = description.video_codec ?? 'VP9';
    const senders: [TransceiverLike | null, 'audio' | 'video', string, boolean][] = [
      [this.audioTransceiver, 'audio', 'opus', this.micTrack !== null],
      [this.cameraTransceiver, 'video', codec, this.cameraTrack !== null],
      [this.screenTransceiver, 'video', codec, this.screenTrack !== null],
    ];
    for (const [transceiver, kind, senderCodec, hasTrack] of senders) {
      if (!transceiver || (cryptor.gated && !hasTrack)) continue;
      await cryptor.attachSender(transceiver.sender, kind, senderCodec, this.options.userId);
      this.protectedSenders.add(transceiver.sender);
    }
  }

  /**
   * Puts a track on a sender. In an E2EE call whose cryptor is gated, the first track of a sender is sent only
   * after the cryptor is attached and enabled: the sender is paused, gets the track, is protected, and only then
   * resumes. A failure at any step leaves the call, and the sender stays paused.
   */
  private async replaceProtected(transceiver: TransceiverLike, track: MediaTrackLike | null, kind: 'audio' | 'video'): Promise<void> {
    const sender = transceiver.sender;
    const cryptor = this.options.cryptor;
    if (!track || !this.description?.e2ee || !cryptor?.gated || this.protectedSenders.has(sender)) {
      await sender.replaceTrack(track);
      return;
    }
    try {
      await this.setSenderActive(sender, false);
      await sender.replaceTrack(track);
      await cryptor.attachSender(sender, kind, kind === 'audio' ? 'opus' : this.codecName(), this.options.userId);
      this.protectedSenders.add(sender);
      await this.setSenderActive(sender, true);
    } catch (error) {
      this.fail(`Could not protect the media this device sends: ${errorText(error)}`);
    }
  }

  private async setSenderActive(sender: RtpSenderLike, active: boolean): Promise<void> {
    const params = sender.getParameters();
    const encodings = (params.encodings && params.encodings.length > 0 ? params.encodings : [{}]) as RtpEncodingLike[];
    await sender.setParameters({ ...params, encodings: encodings.map((encoding) => ({ ...encoding, active })) });
  }

  private bypassSenders(): void {
    for (const transceiver of [this.audioTransceiver, this.cameraTransceiver, this.screenTransceiver]) {
      if (transceiver) this.options.cryptor?.bypass(transceiver.sender);
    }
  }

  private beginDave(description: SessionDescription): void {
    if (!this.options.createDave || !description.e2ee) {
      this.fail('End-to-end encryption was announced but is not available in this client.');
      return;
    }
    this.dave = this.options.createDave((op, d) => this.sendFrame(op, d), {
      hasPeers: () => this.peersSeen,
      onActive: (active) => this.setE2ee(active),
      onError: (message) => {
        this.setE2ee(false);
        console.error('DAVE error', message);
      },
    });
    const dave = this.dave;
    const early = this.earlyDave;
    this.earlyDave = [];
    void dave.start(description.e2ee.protocol_version).then(async () => {
      for (const frame of early) await dave.handleOp(frame.op, frame.d);
    });
  }

  private setE2ee(active: boolean): void {
    if (this.e2eeActive === active) return;
    this.e2eeActive = active;
    this.e2ee.emit(active);
  }

  // ---- remote sources --------------------------------------------------

  private sourceKey(userId: string, source: SourceKind): string {
    return `${userId}:${source}`;
  }

  private upsertSource(userId: string, source: SourceKind, ssrc: number, rtxSsrc: number): void {
    const key = this.sourceKey(userId, source);
    const existing = this.sources.get(key);
    if (source === 'screen') useVoiceStore.getState().setScreenSsrc(key, ssrc);
    if (ssrc <= 0) {
      if (existing?.active) {
        existing.active = false;
        this.dropRemote(existing);
        this.scheduleRenegotiation();
      }
      return;
    }
    if (existing?.active && existing.ssrc === ssrc) return;
    // An active source whose ssrc is corrected (the speaking op announces the node's planned ssrc, the video op the
    // browser's real one) keeps its transceiver and track: dropping the stream here would silence it for good,
    // because the existing receiver does not fire `track` again.
    if (existing && !existing.active) this.dropRemote(existing);
    this.sources.set(key, { userId, source, ssrc, rtxSsrc, active: true });
    this.ssrcUsers.set(ssrc, userId);
    this.scheduleRenegotiation();
  }

  private onVideo(video: VideoPayload): void {
    const userId = video.user_id;
    if (!userId || userId === this.options.userId) return;
    if (video.audio_ssrc > 0) this.upsertSource(userId, 'audio', video.audio_ssrc, 0);
    const streams = video.streams.filter((s) => s.ssrc > 0 && s.active !== false);
    for (const stream of streams) this.upsertSource(userId, stream.type === 'screen' ? 'screen' : 'camera', stream.ssrc, stream.rtx_ssrc);
    if (streams.length === 0 && video.video_ssrc > 0) this.upsertSource(userId, 'camera', video.video_ssrc, video.rtx_ssrc);
    if (streams.length === 0 && video.video_ssrc <= 0) {
      this.upsertSource(userId, 'camera', 0, 0);
      this.upsertSource(userId, 'screen', 0, 0);
    }
  }

  private onStreamViewers({ user_ids }: StreamViewers): void {
    useVoiceStore.getState().setStreamViewers((user_ids ?? []).filter((id) => id !== this.options.userId));
  }

  private onClientDisconnect({ user_id }: ClientDisconnect): void {
    void this.dave?.participantLeft(user_id);
    for (const source of ['audio', 'camera', 'screen'] as const) this.upsertSource(user_id, source, 0, 0);
    const store = useVoiceStore.getState();
    store.setSpeaking(user_id, 0);
  }

  private onSpeaking(speaking: Speaking): void {
    if (speaking.user_id && speaking.user_id !== this.options.userId) {
      if (!this.ssrcUsers.has(speaking.ssrc)) this.upsertSource(speaking.user_id, 'audio', speaking.ssrc, 0);
      useVoiceStore.getState().setSpeaking(speaking.user_id, speaking.speaking > 0 ? 1 : 0);
    }
  }

  private dropRemote(source: RemoteSource): void {
    if (source.source === 'audio') this.remoteAudio.emit(source.userId, null);
    else useVoiceStore.getState().removeRemoteStreams(source.userId, source.source);
  }

  private onTrack(event: TrackEventLike): void {
    const mid = event.transceiver.mid;
    const plan = this.plans.find((p) => p.mid === mid);
    if (!plan || plan.role !== 'remote') return;
    const { source } = plan;
    const stream = event.streams[0] ?? this.options.createStream(event.track);
    const cryptor = this.options.cryptor;
    if (!this.description?.e2ee) {
      cryptor?.bypass(event.receiver);
      this.deliver(source, stream);
      return;
    }
    if (!cryptor) {
      this.fail('End-to-end encryption was announced but is not available in this client.');
      return;
    }
    const pc = this.pc;
    const attached = cryptor.attachReceiver(event.receiver, kindOf(source.source), source.source === 'audio' ? 'opus' : this.codecName(), source.userId);
    const refuse = (error: unknown) => this.fail(`Could not protect the media this device receives: ${errorText(error)}`);
    if (!cryptor.gated) {
      this.deliver(source, stream);
      attached.catch(refuse);
      return;
    }
    // A gated cryptor passes clear frames until enabled, and the platform plays a remote track by itself: mute it until the receiver is confirmed protected.
    event.track.enabled = false;
    void attached.then(() => {
      if (this.pc !== pc) return;
      // Audio is switched on by the mixer when it receives the stream (it also applies deafen).
      if (source.source !== 'audio') event.track.enabled = true;
      this.deliver(source, stream);
    }, refuse);
  }

  private deliver(source: RemoteSource, stream: MediaStreamLike): void {
    if (source.source === 'audio') this.remoteAudio.emit(source.userId, stream);
    else useVoiceStore.getState().setRemoteStream({ userId: source.userId, kind: source.source, stream: stream as MediaHandle });
  }

  private scheduleRenegotiation(): void {
    if (!this.description) return;
    if (this.renegotiateTimer) clearTimeout(this.renegotiateTimer);
    this.renegotiateTimer = setTimeout(() => {
      this.renegotiateTimer = null;
      this.negotiation = this.negotiation.then(() => this.renegotiate()).catch((error: unknown) => console.error('renegotiation failed', error));
    }, this.options.renegotiationDelayMs ?? 40);
  }

  private async renegotiate(): Promise<void> {
    const pc = this.pc;
    const description = this.description;
    if (!pc || !description) return;
    for (const source of this.sources.values()) {
      const key = this.sourceKey(source.userId, source.source);
      if (source.active && !this.transceivers.has(key)) {
        this.transceivers.set(key, pc.addTransceiver(kindOf(source.source), { direction: 'recvonly' }));
      }
    }
    const offer = await pc.createOffer();
    const sdp = offer.sdp ?? '';
    await pc.setLocalDescription({ type: 'offer', sdp });
    this.plans = this.plans.filter((p) => p.role === 'local-screen');
    for (const [key, transceiver] of this.transceivers) {
      const source = this.sources.get(key);
      if (source && transceiver.mid) this.plans.push({ mid: transceiver.mid, role: 'remote', source });
    }
    const parsed = parseLocalOffer(sdp, this.options.preferredVideoCodec ?? 'VP9');
    this.offerSdp = sdp;
    this.parsedOffer = parsed;
    await this.applyAnswer(sdp, parsed, description);
    // Inactive transceivers that were answered inactive can be reused only by rebuilding; drop bookkeeping for gone sources.
    for (const [key, source] of this.sources) {
      if (source.active) continue;
      const transceiver = this.transceivers.get(key);
      if (transceiver) {
        this.transceivers.delete(key);
        this.transceivers.set(`${key}#retired${this.retiredCount++}`, transceiver);
      }
      this.sources.delete(key);
    }
  }

  // ---- local media -----------------------------------------------------

  async setMicTrack(track: MediaTrackLike | null): Promise<void> {
    this.micTrack = track;
    if (this.audioTransceiver) await this.replaceProtected(this.audioTransceiver, track, 'audio');
  }

  async setCameraTrack(track: MediaTrackLike | null, constraints?: CaptureConstraints): Promise<void> {
    const sender = this.cameraTransceiver?.sender;
    if (!this.cameraTransceiver || !sender) return;
    this.cameraTrack = track;
    await this.replaceProtected(this.cameraTransceiver, track, 'video');
    if (track) await this.applySenderParameters(sender, constraints ?? presetConstraints('720p30'));
    await this.announceVideo();
  }

  async setScreenTrack(track: MediaTrackLike | null, options?: ScreenTrackOptions): Promise<void> {
    const sender = this.screenTransceiver?.sender;
    if (!this.screenTransceiver || !sender) return;
    this.screenTrack = track;
    if (track && options) track.contentHint = options.contentHint;
    await this.replaceProtected(this.screenTransceiver, track, 'video');
    if (track && options) await this.applySenderParameters(sender, options.constraints);
    await this.announceVideo();
  }

  async applyScreenParameters(constraints: CaptureConstraints): Promise<void> {
    const sender = this.screenTransceiver?.sender;
    if (sender) await this.applySenderParameters(sender, constraints);
  }

  private async applySenderParameters(sender: RtpSenderLike, constraints: CaptureConstraints): Promise<void> {
    const params = sender.getParameters();
    const encodings = params.encodings && params.encodings.length > 0 ? params.encodings : [{}];
    const first = encodings[0] as RtpEncodingLike;
    first.maxBitrate = constraints.maxBitrateKbps * 1000;
    if (constraints.frameRate !== undefined) first.maxFramerate = constraints.frameRate;
    await sender.setParameters({ ...params, encodings });
  }

  /** Reads the real outbound ssrcs from stats (the browser, not the node, picks them) and tells the node. */
  private async announceVideo(): Promise<void> {
    const ready = this.ready;
    if (!ready) return;
    const ssrcOf = async (transceiver: TransceiverLike | null): Promise<number> => {
      if (!transceiver?.sender.track) return 0;
      const report = await transceiver.sender.getStats();
      for (const stat of report.values()) if (stat.type === 'outbound-rtp' && typeof stat.ssrc === 'number') return stat.ssrc as number;
      return 0;
    };
    const cameraSsrc = await ssrcOf(this.cameraTransceiver);
    const screenSsrc = await ssrcOf(this.screenTransceiver);
    const streams: VideoPayload['streams'] = [];
    const camera = ready.streams.find((s) => s.type === 'video');
    const screen = ready.streams.find((s) => s.type === 'screen') ?? camera;
    if (cameraSsrc > 0) streams.push({ type: 'video', rid: camera?.rid ?? '100', quality: 100, ssrc: cameraSsrc, rtx_ssrc: camera?.rtx_ssrc ?? 0, active: true });
    if (screenSsrc > 0) streams.push({ type: 'screen', rid: screen?.rid ?? '100', quality: 100, ssrc: screenSsrc, rtx_ssrc: screen?.rtx_ssrc ?? 0, active: true });
    this.sendFrame(VoiceOp.VIDEO, {
      audio_ssrc: this.audioSsrc(),
      video_ssrc: cameraSsrc || screenSsrc,
      rtx_ssrc: 0,
      streams,
    } satisfies VideoPayload);
  }

  setSpeaking(flags: number): void {
    if (flags === this.lastSpeakingFlags) return;
    this.lastSpeakingFlags = flags;
    this.sendFrame(VoiceOp.SPEAKING, { speaking: flags, ssrc: this.audioSsrc() } satisfies Speaking);
  }

  /** Our audio SSRC as the browser chose it (sent in SELECT_PROTOCOL), falling back to READY's. */
  private audioSsrc(): number {
    return this.parsedOffer?.audio.ssrc ?? this.ready?.ssrc ?? 0;
  }

  setSinkWants(wants: MediaSinkWants): void {
    this.sendFrame(VoiceOp.MEDIA_SINK_WANTS, wants);
  }

  // ---- stats -----------------------------------------------------------

  private startStats(): void {
    if (this.statsTimer) return;
    this.statsTimer = setInterval(() => void this.pollLevels(), this.options.statsIntervalMs ?? 200);
  }

  private async pollLevels(): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    const report = await pc.getStats();
    const store = useVoiceStore.getState();
    for (const stat of report.values()) {
      if (stat.type === 'media-source' && stat.kind === 'audio' && typeof stat.audioLevel === 'number') this.localLevel.emit(stat.audioLevel);
      if (stat.type !== 'inbound-rtp' || stat.kind !== 'audio') continue;
      const userId = this.ssrcUsers.get(stat.ssrc as number);
      if (userId && typeof stat.audioLevel === 'number') {
        const level = stat.audioLevel as number;
        if (Math.abs((store.speaking[userId] ?? 0) - level) > 0.02) store.setSpeaking(userId, level);
      }
    }
  }

  async collectStats(): Promise<CallQuality | null> {
    const pc = this.pc;
    if (!pc) return null;
    const report = await pc.getStats();
    let rtt = 0;
    let jitter = 0;
    let jitterSamples = 0;
    let lost = 0;
    let received = 0;
    let sentBytes = 0;
    for (const stat of report.values()) {
      if (stat.type === 'candidate-pair' && stat.state === 'succeeded' && typeof stat.currentRoundTripTime === 'number') {
        rtt = (stat.currentRoundTripTime as number) * 1000;
      } else if (stat.type === 'inbound-rtp') {
        if (typeof stat.jitter === 'number') {
          jitter += (stat.jitter as number) * 1000;
          jitterSamples += 1;
        }
        lost += (stat.packetsLost as number | undefined) ?? 0;
        received += (stat.packetsReceived as number | undefined) ?? 0;
      } else if (stat.type === 'outbound-rtp') {
        sentBytes += (stat.bytesSent as number | undefined) ?? 0;
      }
    }
    const now = Date.now();
    const kbps = this.lastBytes && now > this.lastBytes.at ? ((sentBytes - this.lastBytes.sent) * 8) / (now - this.lastBytes.at) : 0;
    this.lastBytes = { sent: sentBytes, at: now };
    return {
      rttMs: Math.round(rtt),
      jitterMs: jitterSamples > 0 ? Math.round(jitter / jitterSamples) : 0,
      lossPct: received + lost > 0 ? Math.round((lost / (received + lost)) * 1000) / 10 : 0,
      bitrateKbps: Math.max(0, Math.round(kbps)),
    };
  }
}
