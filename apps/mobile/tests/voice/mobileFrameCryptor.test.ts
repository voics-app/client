import { FRAME_KEY_SALT, KEY_RING_SIZE, NO_KEY_INDEX, frameKeyLabel, keyIndexOf } from '@discordy/core/domain/frameFormat';
import { MobileFrameCryptor, type FrameCryptorLike, type FrameCryptorModule, type KeyProviderOptions } from '../../src/voice/mobileFrameCryptor';

/** A recording stand-in for @livekit/react-native-webrtc: every native call lands in `log`, in order. */
function fakeModule(options: { failCreate?: 'sender' | 'receiver'; enabledReadBack?: boolean; setKeyResult?: boolean } = {}) {
  const log: string[] = [];
  const cryptors: { role: string; participantId: string; enabled: boolean; keyIndex: number }[] = [];
  const keys: { participantId: string; key: Uint8Array; keyIndex: number }[] = [];
  let providerOptions: KeyProviderOptions | null = null;
  const make = (role: 'sender' | 'receiver', participantId: string): FrameCryptorLike => {
    if (options.failCreate === role) throw new Error(`Error when creating frame cryptor for ${role}`);
    const state = { role, participantId, enabled: false, keyIndex: 0 };
    cryptors.push(state);
    log.push(`${role} ${participantId}: created`);
    return {
      setKeyIndex: async (keyIndex) => {
        state.keyIndex = keyIndex;
        log.push(`${role} ${participantId}: key index ${keyIndex}`);
        return true;
      },
      setEnabled: async (enabled) => {
        state.enabled = enabled;
        log.push(`${role} ${participantId}: enabled ${String(enabled)}`);
        return true;
      },
      getEnabled: async () => (options.enabledReadBack ?? true) && state.enabled,
      dispose: async () => {
        log.push(`${role} ${participantId}: disposed`);
      },
    };
  };
  const webrtc: FrameCryptorModule = {
    RTCFrameCryptorAlgorithm: { kAesGcm: 0 },
    RTCKeyDerivationAlgorithm: { HKDF: 1 },
    RTCFrameCryptorFactory: {
      createDefaultKeyProvider: (o) => {
        providerOptions = o;
        return {
          setKey: async (participantId, key, keyIndex) => {
            keys.push({ participantId, key, keyIndex });
            log.push(`key ${participantId}@${keyIndex}`);
            return options.setKeyResult ?? true;
          },
          dispose: async () => undefined,
        };
      },
      createFrameCryptorForRtpSender: (participantId) => make('sender', participantId),
      createFrameCryptorForRtpReceiver: (participantId) => make('receiver', participantId),
    },
  };
  return { webrtc, log, cryptors, keys, providerOptions: () => providerOptions };
}

const sender = {} as never;
const receiver = {};
const material = async (userId: string, keyIndex: number) => new Uint8Array(32).fill(userId.length + keyIndex);

describe('MobileFrameCryptor', () => {
  it('is gated: the session must protect before media can flow', () => {
    const cryptor = new MobileFrameCryptor(fakeModule().webrtc);
    expect(cryptor.supported).toBe(true);
    expect(cryptor.gated).toBe(true);
  });

  it('configures the key provider like desktop derives keys: HKDF, the shared salt, per-participant keys, no ratcheting, no clear frames while not ready', async () => {
    const fake = fakeModule();
    await new MobileFrameCryptor(fake.webrtc).attachSender(sender, 'audio', 'opus', 'me');
    expect(fake.providerOptions()).toEqual({
      sharedKey: false,
      ratchetSalt: FRAME_KEY_SALT,
      ratchetWindowSize: 0,
      failureTolerance: -1,
      keyRingSize: KEY_RING_SIZE,
      discardFrameWhenCryptorNotReady: true,
      keyDerivationAlgorithm: 1,
    });
  });

  it('points a sender at the never-keyed index BEFORE enabling it, so an enabled sender without an epoch drops frames', async () => {
    const fake = fakeModule();
    await new MobileFrameCryptor(fake.webrtc).attachSender(sender, 'audio', 'opus', 'me');
    expect(fake.log).toEqual(['sender me: created', `sender me: key index ${NO_KEY_INDEX}`, 'sender me: enabled true']);
  });

  it('rejects an attach when the cryptor cannot be created, enabled or read back as enabled', async () => {
    await expect(new MobileFrameCryptor(fakeModule({ failCreate: 'sender' }).webrtc).attachSender(sender, 'audio', 'opus', 'me')).rejects.toThrow(/creating frame cryptor/);
    await expect(new MobileFrameCryptor(fakeModule({ failCreate: 'receiver' }).webrtc).attachReceiver(receiver, 'audio', 'opus', 'u')).rejects.toThrow(/creating frame cryptor/);
    await expect(new MobileFrameCryptor(fakeModule({ enabledReadBack: false }).webrtc).attachSender(sender, 'audio', 'opus', 'me')).rejects.toThrow(/did not switch on/);
    await expect(new MobileFrameCryptor(fakeModule({ enabledReadBack: false }).webrtc).attachReceiver(receiver, 'audio', 'opus', 'u')).rejects.toThrow(/did not switch on/);
  });

  it('refuses H264 video, which the frame format does not cover', async () => {
    const fake = fakeModule();
    const cryptor = new MobileFrameCryptor(fake.webrtc);
    await expect(cryptor.attachSender(sender, 'video', 'H264', 'me')).rejects.toThrow(/H264/);
    await expect(cryptor.attachReceiver(receiver, 'video', 'H264', 'u')).rejects.toThrow(/H264/);
    expect(fake.cryptors).toEqual([]);
    await cryptor.attachReceiver(receiver, 'video', 'VP9', 'u');
    expect(fake.cryptors).toHaveLength(1);
  });

  it('enables receivers on creation, so frames without a valid trailer are dropped from the first one', async () => {
    const fake = fakeModule();
    await new MobileFrameCryptor(fake.webrtc).attachReceiver(receiver, 'audio', 'opus', 'peer');
    expect(fake.log).toEqual(['receiver peer: created', 'receiver peer: enabled true']);
  });

  it('installs per-sender key material of the epoch for senders and receivers, at the key index of the generation', async () => {
    const fake = fakeModule();
    const cryptor = new MobileFrameCryptor(fake.webrtc);
    await cryptor.attachSender(sender, 'audio', 'opus', 'me');
    await cryptor.attachReceiver(receiver, 'audio', 'opus', 'peer');
    await cryptor.setEpoch(9, material);
    const index = keyIndexOf(9);
    expect(fake.keys.map((k) => [k.participantId, k.keyIndex, k.key.length])).toEqual([
      ['me', index, 32],
      ['peer', index, 32],
    ]);
    expect(Array.from(fake.keys[1]!.key)).toEqual(Array.from(await material('peer', index)));
    // the exporter labels these key material requests carry the sender and key index, the same on desktop
    expect(frameKeyLabel('peer', index)).toBe(`voics-voice-frame-key|peer|${index}`);
  });

  it('keys a participant that attaches after the epoch, and starts sending only on activate', async () => {
    const fake = fakeModule();
    const cryptor = new MobileFrameCryptor(fake.webrtc);
    await cryptor.attachSender(sender, 'audio', 'opus', 'me');
    await cryptor.setEpoch(2, material);
    expect(fake.cryptors[0]?.keyIndex).toBe(NO_KEY_INDEX);
    await cryptor.activate(2);
    expect(fake.cryptors[0]?.keyIndex).toBe(keyIndexOf(2));
    await cryptor.attachReceiver(receiver, 'audio', 'opus', 'late');
    expect(fake.keys.at(-1)).toMatchObject({ participantId: 'late', keyIndex: keyIndexOf(2) });
  });

  it('creates a sender attached after activation already pointing at the active key, never at a stale one', async () => {
    const fake = fakeModule();
    const cryptor = new MobileFrameCryptor(fake.webrtc);
    await cryptor.setEpoch(4, material);
    await cryptor.activate(4);
    await cryptor.attachSender(sender, 'audio', 'opus', 'me');
    expect(fake.log.filter((line) => line.startsWith('sender'))).toEqual(['sender me: created', `sender me: key index ${keyIndexOf(4)}`, 'sender me: enabled true']);
  });

  it('fails the epoch when the native side refuses a key', async () => {
    const cryptor = new MobileFrameCryptor(fakeModule({ setKeyResult: false }).webrtc);
    await cryptor.attachSender(sender, 'audio', 'opus', 'me');
    await expect(cryptor.setEpoch(1, material)).rejects.toThrow(/refused a key/);
  });

  it('on clear points every sender at the never-keyed index, so nothing more is sent', async () => {
    const fake = fakeModule();
    const cryptor = new MobileFrameCryptor(fake.webrtc);
    await cryptor.attachSender(sender, 'audio', 'opus', 'me');
    await cryptor.setEpoch(1, material);
    await cryptor.activate(1);
    cryptor.clear();
    await Promise.resolve();
    expect(fake.cryptors[0]?.keyIndex).toBe(NO_KEY_INDEX);
    expect(fake.cryptors[0]?.enabled).toBe(true);
  });

  it('never switches a cryptor off: that would let clear frames through', async () => {
    const fake = fakeModule();
    const cryptor = new MobileFrameCryptor(fake.webrtc);
    await cryptor.attachSender(sender, 'audio', 'opus', 'me');
    await cryptor.attachReceiver(receiver, 'audio', 'opus', 'peer');
    cryptor.clear();
    cryptor.dispose();
    expect(fake.log.some((line) => line.endsWith('enabled false'))).toBe(false);
  });

  it('ignores bypass, because a call that is not end-to-end encrypted attaches nothing', () => {
    const fake = fakeModule();
    new MobileFrameCryptor(fake.webrtc).bypass();
    expect(fake.log).toEqual([]);
  });

  it('releases native cryptors on dispose', async () => {
    const fake = fakeModule();
    const cryptor = new MobileFrameCryptor(fake.webrtc);
    await cryptor.attachSender(sender, 'audio', 'opus', 'me');
    await cryptor.attachReceiver(receiver, 'audio', 'opus', 'peer');
    cryptor.dispose();
    await Promise.resolve();
    expect(fake.log).toEqual(expect.arrayContaining(['sender me: disposed', 'receiver peer: disposed']));
  });
});
