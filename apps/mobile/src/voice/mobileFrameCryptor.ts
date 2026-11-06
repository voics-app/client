/**
 * Media E2EE on the phone: the frame cryptor port over LiveKit's native frame cryptor in
 * @livekit/react-native-webrtc. The native cryptor writes and reads the frame layout of
 * domain/frameFormat (AES-128-GCM, IV and key index in the trailer), so a phone and a desktop in the same call
 * understand each other's frames.
 *
 * Keys: the key provider holds one key per participant and key index. Its material is 32 bytes of MLS exporter
 * secret per sender and key index (EpochKeyBook), which the native side turns into the AES key with
 * HKDF-SHA256(material, FRAME_KEY_SALT, 128 zero bytes), the derivation desktop applies too.
 *
 * Safety. The native cryptor passes frames in clear until it is enabled, and a sender cryptor can only be created
 * on a sender that holds a track. So `gated` is true (the call session attaches before any media can flow and
 * never lets a track reach an unprotected sender), a cryptor is enabled the moment it exists, and an attach
 * resolves only after the native side confirms `enabled`. A sender cryptor is created pointing at a key index that
 * never holds a key, so an enabled sender with no active epoch drops every frame. A receiver cryptor drops every
 * frame without a valid trailer, an unknown key or a failing tag. No code here logs key material.
 */
import type { KeyMaterialSource, FrameCryptorPort } from '@discordy/core/application/ports/voice';
import type { MediaKind, RtpReceiverLike, RtpSenderLike } from '@discordy/core/application/ports/media';
import { EpochKeyBook } from '@discordy/core/application/voice/epochKeyBook';
import { FRAME_KEY_SALT, KEY_RING_SIZE, NO_KEY_INDEX, isE2eeVideoCodec, keyIndexOf } from '@discordy/core/domain/frameFormat';

/** The parts of @livekit/react-native-webrtc this adapter uses. */
export interface KeyProviderLike {
  setKey(participantId: string, key: Uint8Array, keyIndex: number): Promise<boolean>;
  dispose(): Promise<void>;
}

export interface FrameCryptorLike {
  setKeyIndex(keyIndex: number): Promise<boolean>;
  setEnabled(enabled: boolean): Promise<boolean>;
  getEnabled(): Promise<boolean>;
  dispose(): Promise<void>;
}

export interface KeyProviderOptions {
  sharedKey: boolean;
  ratchetSalt: string;
  ratchetWindowSize: number;
  failureTolerance: number;
  keyRingSize: number;
  discardFrameWhenCryptorNotReady: boolean;
  keyDerivationAlgorithm: number;
}

export interface FrameCryptorModule {
  RTCFrameCryptorFactory: {
    createDefaultKeyProvider(options: KeyProviderOptions): KeyProviderLike;
    createFrameCryptorForRtpSender(participantId: string, sender: unknown, algorithm: number, keyProvider: KeyProviderLike): FrameCryptorLike;
    createFrameCryptorForRtpReceiver(participantId: string, receiver: unknown, algorithm: number, keyProvider: KeyProviderLike): FrameCryptorLike;
  };
  RTCFrameCryptorAlgorithm: { kAesGcm: number };
  RTCKeyDerivationAlgorithm: { HKDF: number };
}

export class MobileFrameCryptor implements FrameCryptorPort {
  readonly supported = true;
  readonly gated = true;

  private provider: KeyProviderLike | null = null;
  private readonly senders: FrameCryptorLike[] = [];
  private readonly receivers: FrameCryptorLike[] = [];
  private activeIndex: number | null = null;
  private readonly keys = new EpochKeyBook(async (userId, keyIndex, material) => {
    if (!(await this.keyProvider().setKey(userId, material, keyIndex))) throw new Error('the frame cryptor refused a key');
  });

  constructor(private readonly webrtc: FrameCryptorModule) {}

  private keyProvider(): KeyProviderLike {
    this.provider ??= this.webrtc.RTCFrameCryptorFactory.createDefaultKeyProvider({
      sharedKey: false,
      ratchetSalt: FRAME_KEY_SALT,
      ratchetWindowSize: 0,
      failureTolerance: -1,
      keyRingSize: KEY_RING_SIZE,
      discardFrameWhenCryptorNotReady: true,
      keyDerivationAlgorithm: this.webrtc.RTCKeyDerivationAlgorithm.HKDF,
    });
    return this.provider;
  }

  /** Enables the cryptor and reads the state back: media may flow only once the native side says it is on. */
  private async enable(cryptor: FrameCryptorLike): Promise<void> {
    await cryptor.setEnabled(true);
    if (!(await cryptor.getEnabled())) throw new Error('the frame cryptor did not switch on');
  }

  private checkCodec(kind: MediaKind, codec: string): void {
    if (kind === 'video' && !isE2eeVideoCodec(codec)) throw new Error(`end-to-end encryption does not support ${codec} video`);
  }

  async attachSender(sender: RtpSenderLike, kind: MediaKind, codec: string, userId: string): Promise<void> {
    this.checkCodec(kind, codec);
    const { RTCFrameCryptorFactory, RTCFrameCryptorAlgorithm } = this.webrtc;
    const cryptor = RTCFrameCryptorFactory.createFrameCryptorForRtpSender(userId, sender, RTCFrameCryptorAlgorithm.kAesGcm, this.keyProvider());
    // Before it is on, point it at an index that never holds a key: an enabled sender without an active epoch drops frames.
    await cryptor.setKeyIndex(this.activeIndex ?? NO_KEY_INDEX);
    await this.enable(cryptor);
    this.senders.push(cryptor);
    await this.keys.addUser(userId);
  }

  async attachReceiver(receiver: RtpReceiverLike, kind: MediaKind, codec: string, userId: string): Promise<void> {
    this.checkCodec(kind, codec);
    const { RTCFrameCryptorFactory, RTCFrameCryptorAlgorithm } = this.webrtc;
    const cryptor = RTCFrameCryptorFactory.createFrameCryptorForRtpReceiver(userId, receiver, RTCFrameCryptorAlgorithm.kAesGcm, this.keyProvider());
    await this.enable(cryptor);
    this.receivers.push(cryptor);
    await this.keys.addUser(userId);
  }

  /** Calls that are not end-to-end encrypted attach nothing: their frames are clear by design. */
  bypass(): void {}

  setEpoch(generation: number, material: KeyMaterialSource): Promise<void> {
    return this.keys.setEpoch(generation, material);
  }

  async activate(generation: number): Promise<void> {
    const index = keyIndexOf(generation);
    this.activeIndex = index;
    await Promise.all(this.senders.map((cryptor) => cryptor.setKeyIndex(index)));
  }

  /** Stops every sender (it is pointed at the key index that never holds a key) and forgets the epoch. Received frames stay protected. */
  clear(): void {
    this.activeIndex = null;
    this.keys.clear();
    for (const cryptor of this.senders) void cryptor.setKeyIndex(NO_KEY_INDEX).catch(() => undefined);
  }

  /** Releases the native cryptors; call it only after the peer connection is closed. */
  dispose(): void {
    for (const cryptor of [...this.senders, ...this.receivers]) void cryptor.dispose().catch(() => undefined);
    void this.provider?.dispose().catch(() => undefined);
    this.senders.length = 0;
    this.receivers.length = 0;
    this.provider = null;
    this.activeIndex = null;
    this.keys.clear();
  }
}
