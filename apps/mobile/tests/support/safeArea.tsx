import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

/** Wraps a component that opens a bottom sheet (which reads the safe area) for a render outside the router. */
export const withSafeArea = (ui: ReactElement, frame: { width: number; height: number } = metrics.frame): ReactElement => (
  <SafeAreaProvider initialMetrics={{ ...metrics, frame: { x: 0, y: 0, ...frame } }}>{ui}</SafeAreaProvider>
);
