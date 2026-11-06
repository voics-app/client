import type { ComponentType } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { isNativeBuild } from '../native/isNativeBuild';
import { theme } from '../theme';
import type { NativeVideoStream } from './nativeVoice';

interface RtcViewProps {
  testID?: string;
  streamURL: string;
  objectFit: 'cover' | 'contain';
  mirror: boolean;
  zOrder: number;
  style: StyleProp<ViewStyle>;
}

let rtcView: ComponentType<RtcViewProps> | null | undefined;

/** The native video view, loaded on first use: Expo Go does not contain it, and a failed load shows an empty surface instead of crashing. */
function loadRtcView(): ComponentType<RtcViewProps> | null {
  if (rtcView !== undefined) return rtcView;
  rtcView = null;
  if (isNativeBuild) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      rtcView = (require('@livekit/react-native-webrtc') as { RTCView: ComponentType<RtcViewProps> }).RTCView;
    } catch {
      rtcView = null;
    }
  }
  return rtcView;
}

/** Renders a camera or screen stream. `mirror` is for your own front camera, so the preview behaves like a mirror. */
export function VideoSurface({ stream, mirror = false, fit = 'cover', overlay = false, style }: { stream: NativeVideoStream; mirror?: boolean; fit?: 'cover' | 'contain'; overlay?: boolean; style?: StyleProp<ViewStyle> }) {
  const Rtc = loadRtcView();
  if (!Rtc) return <View testID="video-surface-empty" style={[styles.empty, style]} />;
  // zOrder 1 draws a small tile over a large one (the picture in picture of a one to one call).
  return <Rtc testID="video-surface" streamURL={stream.toURL()} objectFit={fit} mirror={mirror} zOrder={overlay ? 1 : 0} style={style} />;
}

const styles = StyleSheet.create({ empty: { backgroundColor: theme.raised } });
