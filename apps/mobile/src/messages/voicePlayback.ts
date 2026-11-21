import { Platform } from 'react-native';

interface NativePlayback {
  preparePlayback(uri: string): Promise<string>;
  discardPlayback(uri: string): Promise<void>;
}

function nativePlayback(): NativePlayback | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireOptionalNativeModule } = require('expo') as { requireOptionalNativeModule<T>(name: string): T | null };
    return requireOptionalNativeModule<NativePlayback>('VoicsRecorder');
  } catch { return null; }
}

export async function prepareVoicePlayback(uri: string): Promise<string> {
  if (Platform.OS !== 'ios') return uri;
  const native = nativePlayback();
  if (!native?.preparePlayback) throw new Error('Opus playback is not available in this build.');
  return native.preparePlayback(uri);
}

export async function discardVoicePlayback(uri: string): Promise<void> {
  if (Platform.OS === 'ios') await nativePlayback()?.discardPlayback(uri);
}
