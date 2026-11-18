import { Platform } from 'react-native';
import type { NativeVideoStream, WebRtcModule } from './nativeVoice';
import type { ScreenShareDriver } from './mobileScreenShare';

export interface BroadcastModule {
  requestBroadcast(): Promise<boolean>;
  stopBroadcast(): Promise<void>;
}

/** Prepare the WebRTC socket before showing Apple's consent sheet; publish only after ReplayKit starts. */
export function createIosScreenShare(getDisplayMedia: () => Promise<NativeVideoStream>, broadcast: BroadcastModule): ScreenShareDriver {
  let generation = 0;
  return {
    open: async () => {
      const attempt = generation;
      const stream = await getDisplayMedia();
      try {
        if (attempt === generation && await broadcast.requestBroadcast()) return stream;
      } catch (error) {
        stream.getTracks().forEach((track) => track.stop());
        throw error;
      }
      stream.getTracks().forEach((track) => track.stop());
      return null;
    },
    cancel: () => {
      generation += 1;
      void broadcast.stopBroadcast().catch(() => undefined);
    },
  };
}

export function loadIosScreenShare(media: WebRtcModule['mediaDevices']): ScreenShareDriver | undefined {
  if (Platform.OS !== 'ios' || !media.getDisplayMedia) return undefined;
  // The module is local to native builds, so an older binary must not advertise a share button.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { requireOptionalNativeModule } = require('expo-modules-core') as { requireOptionalNativeModule<T>(name: string): T | null };
  const broadcast = requireOptionalNativeModule<BroadcastModule>('VoicsScreenShare');
  return broadcast ? createIosScreenShare(() => media.getDisplayMedia!(), broadcast) : undefined;
}
