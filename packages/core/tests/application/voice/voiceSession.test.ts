import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceOp, type SessionDescription } from '@discordy/core/contracts/voice';
import type { MediaPeerConnection, MediaTrackLike } from '@discordy/core/application/ports/media';
import { VoiceSession, type VoiceSessionOptions } from '@discordy/core/application/voice/voiceSession';
import { voiceUrl } from '@discordy/core/application/voice/voiceUrl';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { FakeSocket } from '../../infrastructure/fakeSocket';
import { FakePeerConnection } from '../../support/fakePeerConnection';

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
    createPeerConnection: () => new FakePeerConnection() as unknown as MediaPeerConnection,
    createStream: (track) => ({ getTracks: () => [track], getVideoTracks: () => [] }),
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
  it('denies missing, stale and expired publication announcements', async () => {
    const capability = vi.fn();
    const track = { kind: 'audio', stop: () => undefined } as MediaTrackLike;
    const session = makeSession({ soundboardTrack: track, onSoundboardCapability: capability });
    const socket = await connectToReady(session);
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description() });
    await vi.advanceTimersByTimeAsync(5);
    expect(capability).not.toHaveBeenCalled();
    const grant = { session_id: 'sess', revision: 2, expires_at: Date.now() + 1000, can_publish_audio: true, can_publish_video: true, can_publish_soundboard: true };
    socket.receive({ op: VoiceOp.PUBLISH_PERMISSIONS, d: grant });
    expect(capability).toHaveBeenLastCalledWith(true);
    socket.receive({ op: VoiceOp.PUBLISH_PERMISSIONS, d: { ...grant, revision: 1 } });
    expect(capability).toHaveBeenLastCalledWith(false);
    socket.receive({ op: VoiceOp.PUBLISH_PERMISSIONS, d: grant });
    expect(capability).toHaveBeenLastCalledWith(false);
    socket.receive({ op: VoiceOp.PUBLISH_PERMISSIONS, d: { ...grant, revision: 3 } });
    expect(capability).toHaveBeenLastCalledWith(true);
    await vi.advanceTimersByTimeAsync(1001);
    expect(capability).toHaveBeenLastCalledWith(false);
    session.close();
  });

  it('routes a separate soundboard stream and removes it without dropping microphone audio', async () => {
    const received: [string, unknown][] = [];
    const session = makeSession({ onSoundboardAudio: (user, stream) => received.push([user, stream]) });
    const socket = await connectToReady(session);
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description() });
    await vi.advanceTimersByTimeAsync(5);
    socket.receive({ op: VoiceOp.VIDEO, d: { user_id: 'u2', audio_ssrc: 0, soundboard_ssrc: 4321, video_ssrc: 0, rtx_ssrc: 0, streams: [] } });
    await vi.advanceTimersByTimeAsync(10);
    const stream = { id: 'u2:soundboard' };
    FakePeerConnection.latest().track('3', stream);
    expect(received).toEqual([['u2', stream]]);
    socket.receive({ op: VoiceOp.VIDEO, d: { user_id: 'u2', audio_ssrc: 0, soundboard_ssrc: null, video_ssrc: 0, rtx_ssrc: 0, streams: [] } });
    expect(received).toEqual([['u2', stream], ['u2', null]]);
    session.close();
  });

  it('announces a camera once native outbound stats become available after replaceTrack', async () => {
    const session = makeSession();
    const socket = await connectToReady(session);
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description() });
    await vi.advanceTimersByTimeAsync(5);
    const sender = FakePeerConnection.latest().transceivers[1]!.sender;
    let framesStarted = false;
    sender.getStats = async () => new Map(framesStarted ? [['video', { type: 'outbound-rtp', ssrc: 9001 }]] : []);
    await session.setCameraTrack({ kind: 'video', stop: () => undefined });
    framesStarted = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(socket.sent.filter((f) => f.op === VoiceOp.VIDEO).at(-1)?.d).toMatchObject({ video_ssrc: 9001 });
    await session.setCameraTrack(null);
    await vi.advanceTimersByTimeAsync(1000);
    expect(socket.sent.filter((f) => f.op === VoiceOp.VIDEO).at(-1)?.d).toMatchObject({ video_ssrc: 0, streams: [] });
    session.close();
  });

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

  it('reports the level of the audio it sends from the media-source stats, for platforms that cannot meter the mic', async () => {
    const session = makeSession();
    const levels: number[] = [];
    session.onLocalLevel((level) => levels.push(level));
    const socket = await connectToReady(session);
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description() });
    await vi.advanceTimersByTimeAsync(5);
    const pc = FakePeerConnection.latest();
    pc.stats = [
      { type: 'media-source', kind: 'video', audioLevel: 0.9 },
      { type: 'media-source', kind: 'audio', audioLevel: 0.25 },
    ];
    pc.setState('connected');
    await vi.advanceTimersByTimeAsync(210);
    expect(levels).toEqual([0.25]);
  });

  it('reports the real outbound ssrcs in a VIDEO op when the camera starts', async () => {
    const session = makeSession();
    const socket = await connectToReady(session);
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description() });
    await vi.advanceTimersByTimeAsync(5);
    await session.setCameraTrack({ kind: 'video' } as MediaTrackLike);
    const video = socket.sent.filter((f) => f.op === VoiceOp.VIDEO).at(-1)!.d as { audio_ssrc: number; streams: { type: string; ssrc: number }[] };
    expect(video.audio_ssrc).toBe(555);
    expect(video.streams).toEqual([expect.objectContaining({ type: 'video', ssrc: 777 })]);
  });

  it('applies bitrate and framerate from the preset to the screen sender', async () => {
    const session = makeSession();
    const socket = await connectToReady(session);
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description() });
    await vi.advanceTimersByTimeAsync(5);
    const track = { kind: 'video', contentHint: '' } as unknown as MediaTrackLike;
    await session.setScreenTrack(track, { constraints: { width: 1920, height: 1080, frameRate: 60, maxBitrateKbps: 6000 }, contentHint: 'motion' });
    const sender = FakePeerConnection.latest().transceivers[2]!.sender;
    expect(sender.params.encodings[0]).toEqual({ maxBitrate: 6_000_000, maxFramerate: 60 });
    expect(track.contentHint).toBe('motion');
  });
});

describe('VoiceSession end-to-end encryption honesty', () => {
  const dave = () => ({ start: vi.fn(async () => undefined), stop: vi.fn(), handleOp: vi.fn(async () => undefined), participantLeft: vi.fn(async () => undefined) }) as never;

  const cryptor = (supported: boolean, gated = false) => ({
    supported,
    gated,
    attachSender: vi.fn(async (_sender: unknown, _kind: string, _codec: string, _userId: string): Promise<void> => undefined),
    attachReceiver: vi.fn(async (): Promise<void> => undefined),
    setEpoch: vi.fn(async () => undefined),
    activate: vi.fn(async () => undefined),
    bypass: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  });

  it('protects a separate soundboard sender before applying an E2EE answer', async () => {
    const c = cryptor(true);
    const track = { kind: 'audio', stop: () => undefined } as MediaTrackLike;
    const session = makeSession({ cryptor: c, createDave: dave, soundboardTrack: track });
    const socket = await connectToReady(session);
    const select = socket.sent.find((frame) => frame.op === VoiceOp.SELECT_PROTOCOL)?.d;
    expect(select).toMatchObject({ data: { ssrcs: { audio: 111, soundboard: 112 } } });
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description({ e2ee: { protocol_version: 2 } }) });
    await vi.advanceTimersByTimeAsync(5);
    const pc = FakePeerConnection.latest();
    expect(c.attachSender).toHaveBeenCalledWith(pc.transceivers[3]!.sender, 'audio', 'opus', 'me');
    expect(pc.remoteDescriptions[0]).toMatch(/m=audio[\s\S]*a=mid:3[\s\S]*a=recvonly/);
    session.close();
  });

  it('does not enable soundboard in an encrypted call until media keys are active', async () => {
    const capability = vi.fn();
    let hooks: { onActive(active: boolean): void } | null = null;
    const track = { kind: 'audio', stop: () => undefined } as MediaTrackLike;
    const session = makeSession({ cryptor: cryptor(true), soundboardTrack: track, onSoundboardCapability: capability, createDave: (_send, h) => { hooks = h; return dave(); } });
    const socket = await connectToReady(session);
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description({ e2ee: { protocol_version: 2 } }) });
    await vi.advanceTimersByTimeAsync(5);
    socket.receive({ op: VoiceOp.PUBLISH_PERMISSIONS, d: { session_id: 'sess', revision: 1, expires_at: Date.now() + 1000, can_publish_audio: true, can_publish_video: true, can_publish_soundboard: true } });
    expect(capability).not.toHaveBeenCalled();
    hooks!.onActive(true);
    expect(capability).toHaveBeenLastCalledWith(true);
    hooks!.onActive(false);
    expect(capability).toHaveBeenLastCalledWith(false);
    session.close();
  });

  it('refuses an E2EE call when the device cannot protect frames', async () => {
    const session = makeSession({ cryptor: cryptor(false) });
    const closed: { fatal: boolean; reason: string }[] = [];
    session.onClosed((c) => closed.push(c));
    const socket = await connectToReady(session);
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description({ e2ee: { protocol_version: 2 } }) });
    await vi.advanceTimersByTimeAsync(5);
    expect(closed[0]?.fatal).toBe(true);
    expect(FakePeerConnection.latest().remoteDescriptions).toHaveLength(0);
  });

  it('refuses an E2EE call when no DAVE session can be created', async () => {
    const session = makeSession({ cryptor: cryptor(true) });
    const closed: unknown[] = [];
    session.onClosed((c) => closed.push(c));
    const socket = await connectToReady(session);
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description({ e2ee: { protocol_version: 2 } }) });
    await vi.advanceTimersByTimeAsync(5);
    expect(closed).toHaveLength(1);
  });

  it.each([1, 3])('refuses a call that announces end-to-end encryption version %i, with a clear reason and no media', async (version) => {
    const c = cryptor(true);
    const session = makeSession({ cryptor: c, createDave: dave });
    const closed: { fatal: boolean; reason: string }[] = [];
    session.onClosed((info) => closed.push(info));
    const socket = await connectToReady(session);
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description({ e2ee: { protocol_version: version } }) });
    await vi.advanceTimersByTimeAsync(5);
    expect(closed).toHaveLength(1);
    expect(closed[0]?.reason).toContain(`version ${version}`);
    expect(closed[0]?.reason).toContain('only supports version 2');
    expect(FakePeerConnection.latest().remoteDescriptions).toHaveLength(0);
    expect(c.attachSender).not.toHaveBeenCalled();
  });

  it('refuses an E2EE call that negotiated H264 video instead of sending it without the clear header rules', async () => {
    const session = makeSession({ cryptor: cryptor(true) });
    const closed: { reason: string }[] = [];
    session.onClosed((info) => closed.push(info));
    const socket = await connectToReady(session);
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description({ video_codec: 'H264', e2ee: { protocol_version: 2 } }) });
    await vi.advanceTimersByTimeAsync(5);
    expect(closed[0]?.reason).toContain('H264');
    expect(FakePeerConnection.latest().remoteDescriptions).toHaveLength(0);
  });

  it('leaves the call and applies no answer when a sender cannot be protected', async () => {
    const c = cryptor(true);
    c.attachSender.mockRejectedValue(new Error('frame cryptor creation failed'));
    const session = makeSession({ cryptor: c, createDave: dave });
    const closed: { reason: string }[] = [];
    session.onClosed((info) => closed.push(info));
    const socket = await connectToReady(session);
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description({ e2ee: { protocol_version: 2 } }) });
    await vi.advanceTimersByTimeAsync(5);
    expect(closed[0]?.reason).toContain('frame cryptor creation failed');
    expect(FakePeerConnection.latest().remoteDescriptions).toHaveLength(0);
  });

  it('pipes clear media through every sender when the call is not E2EE', async () => {
    const c = cryptor(true);
    const session = makeSession({ cryptor: c, createDave: dave });
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
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description({ e2ee: { protocol_version: 2 } }) });
    await vi.advanceTimersByTimeAsync(5);
    expect(c.attachSender).toHaveBeenCalledTimes(3);
    expect(dave.start).toHaveBeenCalledWith(2);
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

  it('subscribes to remote video only once the frame keys are active, so the keyframe the SFU sends a joiner is not dropped for lack of a key', async () => {
    let hooks: { onActive(a: boolean): void } | null = null;
    const session = makeSession({
      cryptor: cryptor(true),
      createDave: (_send, h) => {
        hooks = h;
        return dave();
      },
    });
    const socket = await connectToReady(session);
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description({ e2ee: { protocol_version: 2 } }) });
    await vi.advanceTimersByTimeAsync(5);
    const pc = FakePeerConnection.latest();

    socket.receive({ op: VoiceOp.VIDEO, d: { user_id: 'u2', audio_ssrc: 1234, video_ssrc: 2345, rtx_ssrc: 2346, streams: [] } });
    await vi.advanceTimersByTimeAsync(10);
    // Audio does not wait for a keyframe; the camera does.
    expect(pc.remoteDescriptions[1]).toContain('a=ssrc:1234 cname:u2');
    expect(pc.remoteDescriptions[1]).not.toContain('a=ssrc:2345');
    expect(pc.transceivers.filter((t) => t.kind === 'video')).toHaveLength(2);

    hooks!.onActive(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(pc.remoteDescriptions.at(-1)).toContain('a=ssrc:2345 cname:u2');
    expect(pc.transceivers.filter((t) => t.kind === 'video')).toHaveLength(3);
  });

  it('asks for a fresh keyframe of every watched video after an epoch rotates, by switching it off and on again at the SFU', async () => {
    let hooks: { onActive(a: boolean): void; onEpoch(): void; members(): string[] } | null = null;
    const session = makeSession({
      cryptor: cryptor(true),
      keyframeDelayMs: 50,
      createDave: (_send, h) => {
        hooks = h as never;
        return dave();
      },
    });
    const socket = await connectToReady(session);
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description({ e2ee: { protocol_version: 2 } }) });
    await vi.advanceTimersByTimeAsync(5);
    socket.receive({ op: VoiceOp.CLIENTS_CONNECT, d: { user_ids: ['u2', 'u3'] } });
    socket.receive({ op: VoiceOp.CLIENT_DISCONNECT, d: { user_id: 'u3' } });
    expect(hooks!.members()).toEqual(['u2']);
    hooks!.onActive(true);
    socket.receive({ op: VoiceOp.VIDEO, d: { user_id: 'u2', audio_ssrc: 1234, video_ssrc: 2345, rtx_ssrc: 2346, streams: [{ type: 'video', rid: '100', quality: 100, ssrc: 2345, rtx_ssrc: 2346, active: true }, { type: 'screen', rid: 'screen', quality: 100, ssrc: 3456, rtx_ssrc: 3457, active: true }] } });
    await vi.advanceTimersByTimeAsync(10);
    session.setSinkWants({ '3456': 100 });
    const wants = () => socket.sent.filter((f) => f.op === VoiceOp.MEDIA_SINK_WANTS).map((f) => f.d);
    expect(wants()).toHaveLength(1);

    hooks!.onEpoch();
    hooks!.onEpoch();
    await vi.advanceTimersByTimeAsync(60);
    expect(wants().slice(1)).toEqual([{ '2345': 0, '3456': 0 }, { '3456': 100 }]);
  });

  it('asks for no keyframe when nothing is watched', async () => {
    let hooks: { onEpoch(): void } | null = null;
    const session = makeSession({ cryptor: cryptor(true), keyframeDelayMs: 1, createDave: (_s, h) => ((hooks = h as never), dave()) });
    const socket = await connectToReady(session);
    socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description({ e2ee: { protocol_version: 2 } }) });
    await vi.advanceTimersByTimeAsync(5);
    hooks!.onEpoch();
    await vi.advanceTimersByTimeAsync(10);
    expect(socket.sent.filter((f) => f.op === VoiceOp.MEDIA_SINK_WANTS)).toHaveLength(0);
  });

  describe('with a gated cryptor (react-native-webrtc: clear frames until the cryptor is enabled)', () => {
    const micTrack = { kind: 'audio' } as unknown as MediaTrackLike;

    function trace(log: string[], pc: FakePeerConnection, c: ReturnType<typeof cryptor>) {
      const real = pc.setRemoteDescription.bind(pc);
      pc.setRemoteDescription = (d) => {
        log.push('answer applied');
        return real(d);
      };
      for (const t of pc.transceivers) {
        const name = t.mid === '0' ? 'audio' : t.mid === '1' ? 'camera' : 'screen';
        const replace = t.sender.replaceTrack.bind(t.sender);
        t.sender.replaceTrack = (track) => {
          log.push(`${name}: track set`);
          return replace(track);
        };
        const set = t.sender.setParameters.bind(t.sender);
        t.sender.setParameters = (params) => {
          log.push(`${name}: active=${String(params.encodings[0]?.active)}`);
          return set(params);
        };
      }
      c.attachSender.mockImplementation(async (_sender, kind) => {
        log.push(`${kind}: cryptor enabled`);
      });
    }

    it('enables the sender cryptor of the microphone before the answer, so no frame can leave in clear', async () => {
      const c = cryptor(true, true);
      const session = makeSession({ cryptor: c, createDave: dave });
      await session.setMicTrack(micTrack);
      const log: string[] = [];
      const socket = await connectToReady(session);
      trace(log, FakePeerConnection.latest(), c);
      socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description({ e2ee: { protocol_version: 2 } }) });
      await vi.advanceTimersByTimeAsync(5);
      expect(log).toEqual(['audio: cryptor enabled', 'answer applied']);
      expect(c.attachSender).toHaveBeenCalledTimes(1);
    });

    it('does not attach to senders without a track, and protects one before its first track can be sent', async () => {
      const c = cryptor(true, true);
      const session = makeSession({ cryptor: c, createDave: dave });
      const socket = await connectToReady(session);
      const log: string[] = [];
      trace(log, FakePeerConnection.latest(), c);
      socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description({ e2ee: { protocol_version: 2 } }) });
      await vi.advanceTimersByTimeAsync(5);
      expect(c.attachSender).not.toHaveBeenCalled();
      log.length = 0;

      await session.setMicTrack(micTrack);
      expect(log).toEqual(['audio: active=false', 'audio: track set', 'audio: cryptor enabled', 'audio: active=true']);
      log.length = 0;
      await session.setMicTrack({ kind: 'audio' } as unknown as MediaTrackLike);
      expect(log).toEqual(['audio: track set']);
    });

    it('protects a camera put back after a reconnect like a new one, and does not attach to its new empty sender before', async () => {
      const c = cryptor(true, true);
      const session = makeSession({ cryptor: c, createDave: dave });
      const first = await connectToReady(session);
      first.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description({ e2ee: { protocol_version: 2 } }) });
      await vi.advanceTimersByTimeAsync(5);
      await session.setCameraTrack({ kind: 'video' } as MediaTrackLike);
      expect(c.attachSender).toHaveBeenCalledTimes(1);
      c.attachSender.mockClear();

      first.serverClose(1006);
      await vi.advanceTimersByTimeAsync(2000);
      const second = FakeSocket.latest();
      second.open();
      second.receive({ op: VoiceOp.READY, d: ready });
      await vi.advanceTimersByTimeAsync(5);
      const log: string[] = [];
      trace(log, FakePeerConnection.latest(), c);
      second.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description({ e2ee: { protocol_version: 2 } }) });
      await vi.advanceTimersByTimeAsync(5);
      expect(c.attachSender).not.toHaveBeenCalled();
      expect(log).toEqual(['answer applied']);
      log.length = 0;

      await session.setCameraTrack({ kind: 'video' } as MediaTrackLike);
      // The last entry is the quality preset applied to the now protected sender.
      expect(log).toEqual(['camera: active=false', 'camera: track set', 'video: cryptor enabled', 'camera: active=true', 'camera: active=true']);
    });

    it('leaves the call and keeps the sender paused when the cryptor cannot be enabled for a late track', async () => {
      const c = cryptor(true, true);
      const session = makeSession({ cryptor: c, createDave: dave });
      const closed: { reason: string }[] = [];
      session.onClosed((info) => closed.push(info));
      const socket = await connectToReady(session);
      socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description({ e2ee: { protocol_version: 2 } }) });
      await vi.advanceTimersByTimeAsync(5);
      c.attachSender.mockRejectedValue(new Error('enable failed'));
      await session.setMicTrack(micTrack);
      const sender = FakePeerConnection.latest().transceivers[0]!.sender;
      expect(sender.params.encodings[0]).toMatchObject({ active: false });
      expect(closed[0]?.reason).toContain('enable failed');
    });

    it('mutes a remote track until its receiver is confirmed protected, and never plays it if protecting fails', async () => {
      const c = cryptor(true, true);
      let release: () => void = () => undefined;
      c.attachReceiver.mockImplementation(() => new Promise<void>((resolve) => (release = resolve)));
      const session = makeSession({ cryptor: c, createDave: dave });
      const audio: unknown[] = [];
      session.onRemoteAudio((_user, stream) => audio.push(stream));
      const socket = await connectToReady(session);
      socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: description({ e2ee: { protocol_version: 2 } }) });
      await vi.advanceTimersByTimeAsync(5);
      const pc = FakePeerConnection.latest();
      socket.receive({ op: VoiceOp.VIDEO, d: { user_id: 'u2', audio_ssrc: 1234, video_ssrc: 0, rtx_ssrc: 0, streams: [] } });
      await vi.advanceTimersByTimeAsync(10);
      const track = { kind: 'audio', enabled: true };
      const transceiver = pc.transceivers.find((t) => t.mid === '3')!;
      pc.ontrack?.({ transceiver, receiver: transceiver.receiver, track, streams: [{ id: 's' }] });
      expect(track.enabled).toBe(false);
      expect(audio).toEqual([]);
      release();
      await vi.advanceTimersByTimeAsync(1);
      expect(audio).toEqual([{ id: 's' }]);

      c.attachReceiver.mockRejectedValue(new Error('no receiver cryptor'));
      const closed: { reason: string }[] = [];
      session.onClosed((info) => closed.push(info));
      const other = { kind: 'audio', enabled: true };
      pc.ontrack?.({ transceiver, receiver: transceiver.receiver, track: other, streams: [{ id: 's2' }] });
      await vi.advanceTimersByTimeAsync(1);
      expect(audio).not.toContainEqual({ id: 's2' });
      expect(closed[0]?.reason).toContain('no receiver cryptor');
    });
  });
});
