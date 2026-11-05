import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { GatewayOp } from '@discordy/core/contracts/gateway';
import type { MediaStreamLike, MediaTrackLike } from '@discordy/core/application/ports/media';
import type { SessionStatus } from '@discordy/core/application/ports/voice';
import type { CryptoBridge } from '@discordy/core/application/ports/crypto';
import { DaveSession } from '@discordy/core/application/voice/daveSession';
import { createMobileVoice } from '../../src/voice/mobileVoice';
import type { NativeAudioStream, NativeAudioTrack, NativeVoice } from '../../src/voice/nativeVoice';

/** Stands in for the core VoiceSession: the protocol itself is tested in core; here only how the phone wires it. */
const mockSessions: MockSession[] = [];
class MockSession {
  closed = false;
  mic: MediaTrackLike | null = null;
  speakingFlags: number[] = [];
  private status: ((s: SessionStatus) => void)[] = [];
  private level: ((l: number) => void)[] = [];
  private audio: ((userId: string, stream: MediaStreamLike | null) => void)[] = [];
  readonly region = 'eu';
  constructor(
    readonly options: {
      endpoint: string;
      serverId: string;
      userId: string;
      sessionId: string;
      token: string;
      createPeerConnection(): unknown;
      cryptor?: unknown;
      createDave?: (send: () => void, hooks: object) => unknown;
      preferredVideoCodec?: string;
    },
  ) {
    mockSessions.push(this);
  }
  connect() {}
  close() {
    this.closed = true;
  }
  setSpeaking(flags: number) {
    this.speakingFlags.push(flags);
  }
  async setMicTrack(track: MediaTrackLike | null) {
    this.mic = track;
  }
  setSinkWants() {}
  async collectStats() {
    return null;
  }
  onStatus(l: (s: SessionStatus) => void) {
    this.status.push(l);
    return () => undefined;
  }
  onClosed() {
    return () => undefined;
  }
  onE2ee() {
    return () => undefined;
  }
  onRemoteAudio(l: (userId: string, stream: MediaStreamLike | null) => void) {
    this.audio.push(l);
    return () => undefined;
  }
  onLocalLevel(l: (level: number) => void) {
    this.level.push(l);
    return () => undefined;
  }
  emitStatus(s: SessionStatus) {
    this.status.forEach((l) => l(s));
  }
  emitLevel(level: number) {
    this.level.forEach((l) => l(level));
  }
  emitRemote(userId: string, stream: MediaStreamLike | null) {
    this.audio.forEach((l) => l(userId, stream));
  }
}
jest.mock('@discordy/core/application/voice/voiceSession', () => ({ VoiceSession: jest.fn((options: ConstructorParameters<typeof MockSession>[0]) => new MockSession(options)) }));

function audioTrack(): NativeAudioTrack & { volume: number | null } {
  const t = {
    kind: 'audio',
    enabled: true,
    volume: null as number | null,
    stop: jest.fn(),
    _setVolume(v: number) {
      t.volume = v;
    },
  };
  return t;
}

const fakeCrypto = {} as CryptoBridge;
const identityKeysOf = async () => ['key'];

function setup(withCrypto = true) {
  const local = audioTrack();
  const route = { start: jest.fn(), stop: jest.fn(), setSpeaker: jest.fn() };
  const peers: unknown[] = [];
  const cryptor = { dispose: jest.fn() };
  const native: NativeVoice = {
    createPeerConnection: (iceServers) => {
      const pc = { iceServers };
      peers.push(pc);
      return pc as never;
    },
    createStream: (track) => ({ getTracks: () => [track], getVideoTracks: () => [] }),
    openMicrophone: async () => local,
    createCryptor: () => cryptor as never,
    route,
  };
  const gateway = { send: jest.fn() };
  const voice = createMobileVoice({
    gateway,
    native,
    socketFactory: jest.fn(),
    iceServers: () => [{ urls: 'stun:s.test:3478' }],
    crypto: withCrypto ? fakeCrypto : null,
    identityKeysOf,
  });
  return { voice, gateway, local, route, peers, cryptor };
}

const serverUpdate = { token: 'tok', guild_id: 'g1', channel_id: 'v1', endpoint: 'rtc.test', region: 'eu' };
const lastState = (gateway: { send: jest.Mock }) => gateway.send.mock.calls.filter(([op]) => op === GatewayOp.VOICE_STATE_UPDATE).at(-1)?.[1];

describe('mobile voice', () => {
  beforeEach(() => {
    mockSessions.length = 0;
    useVoiceStore.getState().resetCall();
    useVoiceStore.setState({ selfMute: false, selfDeaf: false, speaking: {} });
    useSessionStore.setState({ user: { id: 'me', username: 'me', global_name: null, avatar: null }, sessionId: 'sess' });
  });

  it('joins: opens the audio session and the microphone, then tells the gateway', async () => {
    const { voice, gateway, route } = setup();
    await voice.controller.join({ guildId: 'g1', channelId: 'v1' });
    expect(route.start).toHaveBeenCalledTimes(1);
    expect(useVoiceStore.getState().call).toMatchObject({ status: 'connecting', channelId: 'v1', guildId: 'g1' });
    expect(lastState(gateway)).toMatchObject({ guild_id: 'g1', channel_id: 'v1', self_mute: false, self_deaf: false });
    voice.dispose();
  });

  it('creates the voice session for the server it is given, with the mic and the turn servers', async () => {
    const { voice, local, peers } = setup();
    await voice.controller.join({ guildId: 'g1', channelId: 'v1' });
    voice.controller.onVoiceServerUpdate(serverUpdate);
    const session = mockSessions[0]!;
    expect(session.options).toMatchObject({ endpoint: 'rtc.test', serverId: 'g1', userId: 'me', sessionId: 'sess', token: 'tok' });
    expect(session.mic).toBe(local);
    session.options.createPeerConnection();
    expect(peers).toEqual([{ iceServers: [{ urls: 'stun:s.test:3478' }] }]);
    session.emitStatus('connected');
    expect(useVoiceStore.getState().call.status).toBe('connected');
    voice.dispose();
  });

  it('shows you speaking from the level of the outgoing audio, and tells the others', async () => {
    const { voice } = setup();
    await voice.controller.join({ guildId: 'g1', channelId: 'v1' });
    voice.controller.onVoiceServerUpdate(serverUpdate);
    const session = mockSessions[0]!;
    session.emitLevel(0.3);
    expect(useVoiceStore.getState().speaking.me).toBeCloseTo(0.3);
    expect(session.speakingFlags.at(-1)).toBe(1);
    voice.dispose();
  });

  it('mutes: the microphone goes silent, nobody sees you speaking, and the gateway is told', async () => {
    const { voice, gateway, local } = setup();
    await voice.controller.join({ guildId: 'g1', channelId: 'v1' });
    voice.controller.onVoiceServerUpdate(serverUpdate);
    mockSessions[0]!.emitLevel(0.3);
    voice.controller.setMute(true);
    expect(local.enabled).toBe(false);
    expect(useVoiceStore.getState().speaking.me).toBe(0);
    expect(lastState(gateway)).toMatchObject({ self_mute: true });
    mockSessions[0]!.emitLevel(0.9);
    expect(useVoiceStore.getState().speaking.me).toBe(0);
    voice.controller.setMute(false);
    expect(local.enabled).toBe(true);
    voice.dispose();
  });

  it('deafens: remote voices go silent, you are muted too, and undeafening restores your mute state', async () => {
    const { voice, gateway, local } = setup();
    await voice.controller.join({ guildId: 'g1', channelId: 'v1' });
    voice.controller.onVoiceServerUpdate(serverUpdate);
    const theirs = audioTrack();
    const stream: NativeAudioStream = { getTracks: () => [theirs], getVideoTracks: () => [], getAudioTracks: () => [theirs] };
    mockSessions[0]!.emitRemote('u2', stream);
    expect(theirs.enabled).toBe(true);

    voice.controller.setDeaf(true);
    expect([theirs.enabled, theirs.volume, local.enabled]).toEqual([false, 0, false]);
    expect(lastState(gateway)).toMatchObject({ self_deaf: true, self_mute: true });

    voice.controller.setDeaf(false);
    expect([theirs.enabled, local.enabled]).toEqual([true, true]);
    expect(lastState(gateway)).toMatchObject({ self_deaf: false, self_mute: false });
    voice.dispose();
  });

  it('leaves: tells the gateway, closes the session, stops the microphone and the audio session', async () => {
    const { voice, gateway, local, route } = setup();
    await voice.controller.join({ guildId: 'g1', channelId: 'v1' });
    voice.controller.onVoiceServerUpdate(serverUpdate);
    await voice.controller.leave();
    expect(lastState(gateway)).toMatchObject({ channel_id: null });
    expect(mockSessions[0]!.closed).toBe(true);
    expect(local.stop).toHaveBeenCalled();
    expect(route.stop).toHaveBeenCalledTimes(1);
    expect(useVoiceStore.getState().call.status).toBe('idle');
    voice.dispose();
  });

  it('gives every session a frame cryptor and a DAVE session on the MLS engine, so encrypted calls work', async () => {
    const { voice, cryptor } = setup();
    await voice.controller.join({ guildId: 'g1', channelId: 'v1' });
    voice.controller.onVoiceServerUpdate(serverUpdate);
    const session = mockSessions[0]!;
    expect(session.options.cryptor).toBe(cryptor);
    expect(session.options.preferredVideoCodec).toBe('VP8');
    expect(session.options.createDave?.(jest.fn(), { onActive: jest.fn(), onError: jest.fn(), hasPeers: () => false })).toBeInstanceOf(DaveSession);
    voice.dispose();
  });

  it('releases the cryptor when the session closes', async () => {
    const { voice, cryptor } = setup();
    await voice.controller.join({ guildId: 'g1', channelId: 'v1' });
    voice.controller.onVoiceServerUpdate(serverUpdate);
    mockSessions[0]!.emitStatus('connected');
    expect(cryptor.dispose).not.toHaveBeenCalled();
    mockSessions[0]!.emitStatus('closed');
    expect(cryptor.dispose).toHaveBeenCalledTimes(1);
    voice.dispose();
  });

  it('has no cryptor and no DAVE session without the crypto engine, so an encrypted call is refused rather than sent in clear', async () => {
    const { voice } = setup(false);
    await voice.controller.join({ guildId: 'g1', channelId: 'v1' });
    voice.controller.onVoiceServerUpdate(serverUpdate);
    expect(mockSessions[0]!.options.cryptor).toBeUndefined();
    expect(mockSessions[0]!.options.createDave).toBeUndefined();
    voice.dispose();
  });

  it('fails with the reason and closes the audio session when the microphone is refused', async () => {
    const { voice, route } = setup();
    // A second stack whose microphone is refused.
    voice.dispose();
    const refused = createMobileVoice({
      gateway: { send: jest.fn() },
      native: {
        createPeerConnection: () => ({}) as never,
        createStream: () => ({ getTracks: () => [], getVideoTracks: () => [] }),
        openMicrophone: async () => {
          throw new Error('Microphone access is off.');
        },
        createCryptor: () => null,
        route,
      },
      socketFactory: jest.fn(),
      iceServers: () => [],
      crypto: null,
      identityKeysOf,
    });
    await refused.controller.join({ guildId: 'g1', channelId: 'v1' });
    expect(useVoiceStore.getState().call).toMatchObject({ status: 'failed', error: 'Microphone access is off.' });
    expect(route.stop).toHaveBeenCalled();
    refused.dispose();
  });
});
