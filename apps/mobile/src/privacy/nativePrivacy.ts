/**
 * The one place that loads the native pieces of Ephemeral and P2P: the VoicsCrypto Expo module and
 * @livekit/react-native-webrtc. Both are required lazily and only in a native build: Expo Go has neither, and
 * importing them there would crash the app at startup. In Expo Go this returns null and the app keeps
 * showing that these modes are not in the test version.
 */
import type { CryptoBridge } from '@discordy/core/application/ports/crypto';
import { isNativeBuild } from '../native/isNativeBuild';
import { createMobileCryptoBridge, type VoicsCryptoNative } from './cryptoBridge';
import { createReactNativePeerConnection, type PeerConnectionFactory, type WebRtcPeerModule } from './reactNativePeerConnection';

export const PEER_UNAVAILABLE = 'Peer-to-peer needs the calling module, which is missing from this build.';

export interface NativePrivacy {
  crypto: CryptoBridge;
  createPeerConnection: PeerConnectionFactory;
}

/** Builds the pieces from the loaded modules; they are passed in so tests can fake them. */
export function createNativePrivacy(crypto: VoicsCryptoNative, webrtc: WebRtcPeerModule | null): NativePrivacy {
  return {
    crypto: createMobileCryptoBridge(crypto),
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
  return crypto ? createNativePrivacy(crypto, loadWebRtc()) : null;
}
