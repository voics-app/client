import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceOp, type SessionDescription } from '@shared/contracts/voice';
import { VoiceSession, type VoiceSessionOptions } from '@renderer/infrastructure/voice/voiceSession';
import { voiceUrl } from '@renderer/infrastructure/voice/voiceUrl';
import { useVoiceStore } from '@renderer/application/stores/voiceStore';
import { FakeSocket } from '../infrastructure/fakeSocket';
import { FakePeerConnection } from './fakes';

const description = (over: Partial<SessionDescription> = {}): SessionDescription => ({
  ice_ufrag: 'srvufrag',
  ice_pwd: 'srvpwd',
  fingerprint: 'sha-256 11:22:33',
  candidates: [{ ip: '203.0.113.9', port: 40000, protocol: 'udp' }],
  audio_codec: 'opus',
  video_codec: 'VP9',
  e2ee: null,
  ...over,
});

const ready = { ssrc: 555, ip: '203.0.113.9', port: 40000, modes: ['dtls-srtp'], streams: [] };

function makeSession(over: Partial<VoiceSessionOptions> = {}): VoiceSession {
  return new VoiceSession({
    endpoint: 'rtc.example.test',
    region: 'eu',
    serverId: 'g1',
    userId: 'me',
    sessionId: 'sess',
    token: 'tok',
    socketFactory: (url) => new FakeSocket(url),
    createPeerConnection: () => new FakePeerConnection() as unknown as RTCPeerConnection,
    random: () => 0,
    renegotiationDelayMs: 1,
    ...over,
  });
}

async function connectToReady(session: VoiceSession): Promise<FakeSocket> {
  session.connect();
  const socket = FakeSocket.latest();
  socket.open();
  socket.receive({ op: VoiceOp.HELLO, d: { heartbeat_interval: 13750 } });
  socket.receive({ op: VoiceOp.READY, d: ready });
  await vi.advanceTimersByTimeAsync(5);
  return socket;
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.reset();
  FakePeerConnection.reset();
  useVoiceStore.getState().resetCall();
  useVoiceStore.setState({ speaking: {}, remoteStreams: [] });
});
afterEach(() => vi.useRealTimers());

describe('voiceUrl', () => {
  it('normalises endpoints', () => {
    expect(voiceUrl('rtc.example.test')).toBe('wss://rtc.example.test/voice');
    expect(voiceUrl('wss://rtc.example.test/')).toBe('wss://rtc.example.test/voice');
    expect(voiceUrl('ws://localhost:4100/voice')).toBe('ws://localhost:4100/voice');
  });
});

describe('VoiceSession protocol', () => {
  it('follows IDENTIFY, SELECT_PROTOCOL and answers SESSION_DESCRIPTION with a synthesized SDP', async () => {
    const session = makeSession();
    const statuses: string[] = [];
    session.onStatus((s) => statuses.push(s));
    const socket = await connectToReady(session);
    expect(socket.url).toBe('wss://rtc.example.test/voice');
    expect(socket.ops().filter((o) => o !== VoiceOp.HEARTBEAT)).toEqual([VoiceOp.IDENTIFY, VoiceOp.SELECT_PROTOCOL]);
    expect(socket.sent[0]?.d).toEqual({ server_id: 'g1', user_id: 'me', session_id: 'sess', token: 'tok', video: true });
    const select = socket.sent[1]!.d as { protocol: string; data: Record<string, string>; codecs: { name: string; payload_type: number; rtx_payload_type?: number }[] };
    expect(select.protocol).toBe('webrtc');
    expect(select.data).toEqual({ ice_ufrag: 'lufrag', ice_pwd: 'lpwd0123456789012345678', fingerprint: 'sha-256 AA:BB:CC', setup: 'actpass' });
    expect(select.codecs).toEqual([
      { name: 'opus', type: 'audio', priority: 1000, payload_type: 111 },
      { name: 'VP9', type: 'video', priority: 1000, payload_type: 98, rtx_payload_type: 99 },
    ]);

    const pc = FakePeerConnection.latest();
    expect(pc.remoteDescriptions).toHaveLength(0);
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description() });
    await vi.advanceTimersByTimeAsync(5);
    expect(pc.localDescriptions).toHaveLength(1);
    const answer = pc.remoteDescriptions[0]!;
    expect(answer).toContain('a=ice-ufrag:srvufrag');
    expect(answer).toContain('a=fingerprint:sha-256 11:22:33');
    expect(answer).toContain('a=setup:passive');
    expect(answer).toContain('a=group:BUNDLE 0 1 2');
    expect(answer).toMatch(/m=video[\s\S]*a=mid:2[\s\S]*a=recvonly/);

    pc.setState('connected');
    expect(statuses).toContain('connected');
  });

  it('sends heartbeats and reconnects when an ack is missed', async () => {
    const session = makeSession();
    const socket = await connectToReady(session);
    await vi.advanceTimersByTimeAsync(1);
    expect(socket.ops().filter((o) => o === VoiceOp.HEARTBEAT)).toHaveLength(1);
    socket.receive({ op: VoiceOp.HEARTBEAT_ACK, d: { t: 1 } });
    await vi.advanceTimersByTimeAsync(13750);
    expect(socket.ops().filter((o) => o === VoiceOp.HEARTBEAT)).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(13750); // second beat unacked: zombie
    expect(socket.closedWith).toBe(4900);
    await vi.advanceTimersByTimeAsync(2000);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('rebuilds media after a transient close and gives up on fatal codes', async () => {
    const session = makeSession();
    const closed: { fatal: boolean }[] = [];
    session.onClosed((c) => closed.push(c));
    const first = await connectToReady(session);
    const firstPc = FakePeerConnection.latest();
    first.serverClose(1006);
    expect(firstPc.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    const second = FakeSocket.latest();
    expect(second).not.toBe(first);
    second.open();
    expect(second.ops().filter((o) => o !== VoiceOp.HEARTBEAT)).toEqual([VoiceOp.IDENTIFY]);
    second.receive({ op: VoiceOp.READY, d: ready });
    await vi.advanceTimersByTimeAsync(5);
    expect(FakePeerConnection.instances).toHaveLength(2);

    second.serverClose(4004);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(closed).toEqual([{ fatal: true, reason: 'voice closed (4004)' }]);
  });

  it('maps SPEAKING to the store and announces local speaking once per change', async () => {
    const session = makeSession();
    const socket = await connectToReady(session);
    socket.receive({ op: VoiceOp.SPEAKING, d: { speaking: 1, ssrc: 900, user_id: 'u2' } });
    await vi.advanceTimersByTimeAsync(5);
    expect(useVoiceStore.getState().speaking.u2).toBe(1);
    socket.receive({ op: VoiceOp.SPEAKING, d: { speaking: 0, ssrc: 900, user_id: 'u2' } });
    await vi.advanceTimersByTimeAsync(5);
    expect(useVoiceStore.getState().speaking.u2).toBe(0);

    session.setSpeaking(1);
    session.setSpeaking(1);
    session.setSpeaking(0);
    const sent = socket.sent.filter((f) => f.op === VoiceOp.SPEAKING).map((f) => f.d);
    expect(sent).toEqual([
      { speaking: 1, ssrc: 555 },
      { speaking: 0, ssrc: 555 },
    ]);
  });

  it('tracks remote screen ssrcs and the viewers of the local share', async () => {
    const session = makeSession();
    const socket = await connectToReady(session);
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description() });
    await vi.advanceTimersByTimeAsync(5);
    socket.receive({ op: VoiceOp.VIDEO, d: { user_id: 'u2', audio_ssrc: 0, video_ssrc: 0, rtx_ssrc: 0, streams: [{ type: 'screen', ssrc: 777, rtx_ssrc: 778, active: true }] } });
    expect(useVoiceStore.getState().screenSsrcs).toEqual({ 'u2:screen': 777 });
    socket.receive({ op: VoiceOp.VIDEO, d: { user_id: 'u2', audio_ssrc: 0, video_ssrc: 0, rtx_ssrc: 0, streams: [] } });
    expect(useVoiceStore.getState().screenSsrcs).toEqual({});

    socket.receive({ op: VoiceOp.STREAM_VIEWERS, d: { ssrc: 5, user_ids: ['u2', 'u3'] } });
    expect(useVoiceStore.getState().streamViewers).toEqual(['u2', 'u3']);
    socket.receive({ op: VoiceOp.STREAM_VIEWERS, d: { ssrc: 5, user_ids: [] } });
    expect(useVoiceStore.getState().streamViewers).toEqual([]);
  });

  it('negotiates a section per remote source, routes tracks, and removes them on disconnect', async () => {
    const session = makeSession({ statsIntervalMs: 50 });
    const audio: [string, unknown][] = [];
    session.onRemoteAudio((u, s) => audio.push([u, s]));
    const socket = await connectToReady(session);
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description() });
    await vi.advanceTimersByTimeAsync(5);
    const pc = FakePeerConnection.latest();

    socket.receive({ op: VoiceOp.VIDEO, d: { user_id: 'u2', audio_ssrc: 1234, video_ssrc: 2345, rtx_ssrc: 2346, streams: [] } });
    await vi.advanceTimersByTimeAsync(10);
    expect(pc.localDescriptions).toHaveLength(2);
    const answer = pc.remoteDescriptions[1]!;
    expect(answer).toContain('a=group:BUNDLE 0 1 2 3 4');
    expect(answer).toContain('a=ssrc:1234 cname:u2');
    expect(answer).toContain('a=ssrc:2345 cname:u2');
    expect(answer).toContain('a=sendonly');

    const audioStream = { id: 'u2:audio' };
    pc.track('3', audioStream);
    pc.track('4', { id: 'u2:camera' });
    expect(audio).toEqual([['u2', audioStream]]);
    expect(useVoiceStore.getState().remoteStreams.map((r) => [r.userId, r.kind])).toEqual([['u2', 'camera']]);

    pc.stats = [{ type: 'inbound-rtp', kind: 'audio', ssrc: 1234, audioLevel: 0.5 }];
    pc.setState('connected');
    await vi.advanceTimersByTimeAsync(60);
    expect(useVoiceStore.getState().speaking.u2).toBe(0.5);

    socket.receive({ op: VoiceOp.CLIENT_DISCONNECT, d: { user_id: 'u2' } });
    await vi.advanceTimersByTimeAsync(10);
    expect(useVoiceStore.getState().remoteStreams).toHaveLength(0);
    expect(audio[audio.length - 1]).toEqual(['u2', null]);
    expect(pc.remoteDescriptions[2]).toContain('a=inactive');
  });

  it('reports the real outbound ssrcs in a VIDEO op when the camera starts', async () => {
    const session = makeSession();
    const socket = await connectToReady(session);
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description() });
    await vi.advanceTimersByTimeAsync(5);
    await session.setCameraTrack({ kind: 'video' } as MediaStreamTrack);
    const video = socket.sent.filter((f) => f.op === VoiceOp.VIDEO).at(-1)!.d as { audio_ssrc: number; streams: { type: string; ssrc: number }[] };
    expect(video.audio_ssrc).toBe(555);
    expect(video.streams).toEqual([expect.objectContaining({ type: 'video', ssrc: 777 })]);
  });

  it('applies bitrate and framerate from the preset to the screen sender', async () => {
    const session = makeSession();
    const socket = await connectToReady(session);
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description() });
    await vi.advanceTimersByTimeAsync(5);
    const track = { kind: 'video', contentHint: '' } as unknown as MediaStreamTrack;
    await session.setScreenTrack(track, { constraints: { width: 1920, height: 1080, frameRate: 60, maxBitrateKbps: 6000 }, contentHint: 'motion' });
    const sender = FakePeerConnection.latest().transceivers[2]!.sender;
    expect(sender.params.encodings[0]).toEqual({ maxBitrate: 6_000_000, maxFramerate: 60 });
    expect(track.contentHint).toBe('motion');
  });
});

describe('VoiceSession end-to-end encryption honesty', () => {
  const cryptor = (supported: boolean) => ({
    supported,
    attachSender: vi.fn(),
    attachReceiver: vi.fn(),
    setEpoch: vi.fn(),
    activate: vi.fn(),
    setPassthrough: vi.fn(),
    bypass: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  });

  it('refuses an E2EE call when the device cannot protect frames', async () => {
    const session = makeSession({ cryptor: cryptor(false) });
    const closed: { fatal: boolean; reason: string }[] = [];
    session.onClosed((c) => closed.push(c));
    const socket = await connectToReady(session);
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description({ e2ee: { protocol_version: 1 } }) });
    await vi.advanceTimersByTimeAsync(5);
    expect(closed[0]?.fatal).toBe(true);
    expect(FakePeerConnection.latest().remoteDescriptions).toHaveLength(0);
  });

  it('refuses an E2EE call when no DAVE session can be created', async () => {
    const session = makeSession({ cryptor: cryptor(true) });
    const closed: unknown[] = [];
    session.onClosed((c) => closed.push(c));
    const socket = await connectToReady(session);
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description({ e2ee: { protocol_version: 1 } }) });
    await vi.advanceTimersByTimeAsync(5);
    expect(closed).toHaveLength(1);
  });

  it('pipes clear media through every sender when the call is not E2EE', async () => {
    const c = cryptor(true);
    const session = makeSession({ cryptor: c });
    const socket = await connectToReady(session);
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description() });
    await vi.advanceTimersByTimeAsync(5);
    expect(c.bypass).toHaveBeenCalledTimes(3);
    expect(c.attachSender).not.toHaveBeenCalled();
  });

  it('attaches transforms and only reports e2ee once DAVE reports active keys', async () => {
    const c = cryptor(true);
    let hooks: { onActive(a: boolean): void; onError(m: string): void } | null = null;
    const dave = { start: vi.fn(async () => undefined), stop: vi.fn(), handleOp: vi.fn(async () => undefined) };
    const session = makeSession({
      cryptor: c,
      createDave: (_send, h) => {
        hooks = h;
        return dave as never;
      },
    });
    const flags: boolean[] = [];
    session.onE2ee((a) => flags.push(a));
    const socket = await connectToReady(session);
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description({ e2ee: { protocol_version: 1 } }) });
    await vi.advanceTimersByTimeAsync(5);
    expect(c.attachSender).toHaveBeenCalledTimes(3);
    expect(dave.start).toHaveBeenCalledWith(1);
    expect(flags).toEqual([]);
    socket.receive({ op: VoiceOp.DAVE_EXECUTE_TRANSITION, d: { transition_id: 1 } });
    await vi.advanceTimersByTimeAsync(5);
    expect(dave.handleOp).toHaveBeenCalledWith(VoiceOp.DAVE_EXECUTE_TRANSITION, { transition_id: 1 });
    hooks!.onActive(true);
    expect(flags).toEqual([true]);
    hooks!.onError('boom');
    expect(flags).toEqual([true, false]);
  });

  it('never marks a plain call as encrypted', async () => {
    const session = makeSession({ cryptor: cryptor(true) });
    const flags: boolean[] = [];
    session.onE2ee((a) => flags.push(a));
    const socket = await connectToReady(session);
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description() });
    await vi.advanceTimersByTimeAsync(5);
    expect(flags).toEqual([]);
  });
});
