/**
 * The one place that loads the native pieces of Ephemeral and P2P: the VoicsCrypto Expo module and
 * @livekit/react-native-webrtc. Both are required lazily and only in a native build: Expo Go has neither, and
 * importing them there would crash the app at startup. In Expo Go this returns null and the app keeps
 * showing that these modes are not in the test version.
 */
import type { CryptoBridge } from '@discordy/core/application/ports/crypto';
import type { AttachmentPlatform } from '@discordy/core/application/privacy/attachmentService';
import { AttachmentError, fromB64, toB64, type FileKeyMaterial } from '@discordy/core/application/privacy/attachmentCipher';
import { isNativeBuild } from '../native/isNativeBuild';
import { createMobileCryptoBridge, type VoicsCryptoNative } from './cryptoBridge';
import { createReactNativePeerConnection, type PeerConnectionFactory, type WebRtcPeerModule } from './reactNativePeerConnection';

export const PEER_UNAVAILABLE = 'Peer-to-peer needs the calling module, which is missing from this build.';

export interface NativePrivacy {
  crypto: CryptoBridge;
  createPeerConnection: PeerConnectionFactory;
  attachmentPlatform?: AttachmentPlatform;
  fetchAttachmentBytes?: (url: string) => Promise<Uint8Array>;
}

/** Builds the pieces from the loaded modules; they are passed in so tests can fake them. */
type NativeAttachments = Pick<VoicsCryptoNative, 'readAttachment' | 'encryptAttachment' | 'decryptAttachment' | 'uploadAttachment' | 'downloadAttachment' | 'storeAttachment' | 'removeAttachment'>;

export function createNativePrivacy(crypto: VoicsCryptoNative, webrtc: WebRtcPeerModule | null, attachments: NativeAttachments = crypto): NativePrivacy {
  const supported = attachments.readAttachment && attachments.encryptAttachment && attachments.decryptAttachment && attachments.uploadAttachment && attachments.downloadAttachment && attachments.storeAttachment && attachments.removeAttachment;
  return {
    crypto: createMobileCryptoBridge(crypto),
    ...(supported ? {
      attachmentPlatform: {
        read: async (file: File) => {
          const uri = (file as File & { uri?: string }).uri;
          if (!uri) throw new Error('Local attachment is unavailable.');
          return fromB64(await attachments.readAttachment!(uri));
        },
        encrypt: async (plain: Uint8Array) => { const out = await attachments.encryptAttachment!(toB64(plain)); return { ...out, ciphertext: fromB64(out.ciphertext) }; },
        decrypt: async (ciphertext: Uint8Array, material: FileKeyMaterial) => {
          try { return fromB64(await attachments.decryptAttachment!(toB64(ciphertext), material.key_b64, material.nonce_b64, material.sha256_b64, material.size)); }
          catch { throw new AttachmentError('integrity', 'The file failed its integrity check and was discarded.'); }
        },
        upload: (url: string, ciphertext: Uint8Array) => attachments.uploadAttachment!(url, toB64(ciphertext)),
        store: async (id: string, plain: Uint8Array, mime: string) => {
          if (mime !== 'audio/ogg') throw new Error('Only voice recordings are supported on this device.');
          return attachments.storeAttachment!(id, toB64(plain));
        },
        remove: (id: string) => attachments.removeAttachment!(id),
      },
      fetchAttachmentBytes: async (url: string) => fromB64(await attachments.downloadAttachment!(url)),
    } : {}),
    createPeerConnection: webrtc
      ? createReactNativePeerConnection(webrtc)
      : () => {
          throw new Error(PEER_UNAVAILABLE);
        },
  };
}

function loadWebRtc(): WebRtcPeerModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@livekit/react-native-webrtc') as WebRtcPeerModule;
  } catch {
    return null;
  }
}

function loadCryptoModule(): VoicsCryptoNative | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireOptionalNativeModule } = require('expo') as { requireOptionalNativeModule<T>(name: string): T | null };
    return requireOptionalNativeModule<VoicsCryptoNative>('VoicsCrypto');
  } catch {
    return null;
  }
}

/** The native private-messaging stack, or null where the crypto module does not exist (Expo Go, or a build without it). */
export function loadNativePrivacy(): NativePrivacy | null {
  if (!isNativeBuild) return null;
  const crypto = loadCryptoModule();
  if (!crypto) return null;
  try { if (crypto.isAvailable && !crypto.isAvailable()) return null; } catch { return null; }
  try {
    // Android hosts the file adapter in the recorder module; iOS exposes it on VoicsCrypto.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireOptionalNativeModule } = require('expo') as { requireOptionalNativeModule<T>(name: string): T | null };
    const recorder = requireOptionalNativeModule<NativeAttachments>('VoicsRecorder');
    const fileModule = recorder?.encryptAttachment ? recorder : crypto;
    return createNativePrivacy(crypto, loadWebRtc(), fileModule);
  } catch { return createNativePrivacy(crypto, loadWebRtc()); }
}
