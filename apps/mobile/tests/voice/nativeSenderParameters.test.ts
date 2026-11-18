import type NativeParameters from '@livekit/react-native-webrtc/lib/typescript/RTCRtpSendParameters';
import { VoiceSession } from '@discordy/core/application/voice/voiceSession';
import type { MediaPeerConnection } from '@discordy/core/application/ports/media';
import type { FrameCryptorPort } from '@discordy/core/application/ports/voice';
import { VoiceOp } from '@discordy/core/contracts/voice';
import { FakeSocket } from '../../../../packages/core/tests/infrastructure/fakeSocket';
import { FakePeerConnection } from '../../../../packages/core/tests/support/fakePeerConnection';

// Load the shipped, pure-JavaScript serializer without loading native modules.
const { default: NativeSendParameters } = jest.requireActual<{ default: typeof NativeParameters }>(
  '@livekit/react-native-webrtc/lib/commonjs/RTCRtpSendParameters',
);

beforeEach(() => {
  jest.useFakeTimers();
  FakeSocket.reset();
  FakePeerConnection.reset();
});
afterEach(() => jest.useRealTimers());

async function connected(cryptor?: FrameCryptorPort) {
  const session = new VoiceSession({
    endpoint: 'rtc.example.test', region: 'eu', serverId: 'guild', userId: 'me', sessionId: 'session', token: 'token',
    socketFactory: (url) => new FakeSocket(url),
    createPeerConnection: () => new FakePeerConnection() as unknown as MediaPeerConnection,
    createStream: (track) => ({ getTracks: () => [track], getVideoTracks: () => [] }),
    random: () => 0,
    cryptor,
    createDave: () => ({ start: async () => undefined, stop: () => undefined, handleOp: async () => undefined, participantLeft: async () => undefined }),
  });
  session.connect();
  const socket = FakeSocket.latest();
  socket.open();
  socket.receive({ op: VoiceOp.HELLO, d: { heartbeat_interval: 13750 } });
  socket.receive({ op: VoiceOp.READY, d: { ssrc: 555, ip: '203.0.113.9', port: 40000, modes: ['dtls-srtp'], streams: [] } });
  await jest.advanceTimersByTimeAsync(5);
  socket.receive({ op: VoiceOp.SESSION_DESCRIPTION, d: {
    ice_ufrag: 'server', ice_pwd: 'server-password', fingerprint: 'sha-256 11:22:33',
    candidates: [{ ip: '203.0.113.9', port: 40000, protocol: 'udp' }],
    audio_codec: 'opus', video_codec: 'VP9', e2ee: cryptor ? { protocol_version: 2 } : null,
  } });
  await jest.advanceTimersByTimeAsync(5);
  const payloads: Record<string, unknown>[][] = [[], [], []];
  FakePeerConnection.latest().transceivers.forEach(({ sender }, index) => {
    const native = new NativeSendParameters({
      transactionId: `sender-${index}`, codecs: [], headerExtensions: [],
      rtcp: { cname: 'native', reducedSize: true },
      encodings: [{ active: true, rid: 'main', maxBitrate: 500000 }],
    });
    sender.getParameters = () => native as unknown as ReturnType<typeof sender.getParameters>;
    sender.setParameters = async (parameters) => {
      // RTCRtpSender sends exactly this JSON to Java/ObjC. Null degradationPreference
      // crashes Android's enum parser; lost encoding serializers omit bitrate/RID.
      const payload = JSON.parse(JSON.stringify(parameters)) as Record<string, unknown>;
      payloads[index]!.push(payload);
      if (payload.degradationPreference === null) throw new Error('name == null');
    };
  });
  return { session, payloads };
}

it('serializes native camera and screen quality without null enum values or lost encoding fields', async () => {
  const { session, payloads } = await connected();
  try {
    await session.setCameraTrack({ kind: 'video', stop: jest.fn() });
    await session.setScreenTrack({ kind: 'video', stop: jest.fn() }, {
      contentHint: 'detail', constraints: { maxBitrateKbps: 4000, frameRate: 10 },
    });
    expect(payloads[1]![0]).not.toHaveProperty('degradationPreference');
    expect(payloads[1]![0]!.encodings).toEqual([{ active: true, rid: 'main', maxBitrate: 2500000, maxFramerate: 30 }]);
    expect(payloads[2]![0]!.encodings).toEqual([{ active: true, rid: 'main', maxBitrate: 4000000, maxFramerate: 10 }]);
  } finally { session.close(); }
});

it('serializes native pause/protect/resume before publishing an encrypted camera', async () => {
  const order: string[] = [];
  const cryptor: FrameCryptorPort = {
    supported: true, gated: true,
    attachSender: async () => { order.push('protected'); }, attachReceiver: async () => undefined,
    setEpoch: async () => undefined, activate: async () => undefined,
    bypass: () => undefined, clear: () => undefined, dispose: () => undefined,
  };
  const { session, payloads } = await connected(cryptor);
  const sender = FakePeerConnection.latest().transceivers[1]!.sender;
  const set = sender.setParameters.bind(sender);
  sender.setParameters = async (parameters) => {
    await set(parameters);
    order.push(`active=${String(parameters.encodings[0]!.active)}`);
  };
  try {
    await session.setCameraTrack({ kind: 'video', stop: jest.fn() });
    expect(order).toEqual(['active=false', 'protected', 'active=true', 'active=true']);
    expect(payloads[1]![0]!.encodings).toEqual([{ active: false, rid: 'main', maxBitrate: 500000 }]);
    expect(payloads[1]![1]!.encodings).toEqual([{ active: true, rid: 'main', maxBitrate: 500000 }]);
  } finally { session.close(); }
});
