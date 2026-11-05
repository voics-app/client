import * as Haptics from 'expo-haptics';
import { AccessibilityInfo } from 'react-native';

/** Haptics are off while the system "Reduce Motion" setting is on. */
let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled()
  .then((on) => {
    reduceMotion = on;
  })
  .catch(() => undefined);
AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
  reduceMotion = on;
});

const run = (feedback: () => Promise<void>): void => {
  if (!reduceMotion) void feedback().catch(() => undefined);
};

/** A light tap: a long press opened a menu, or a swipe reached its threshold. */
export const tapLight = (): void => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
/** A selection tick: a reaction was toggled. */
export const tickSelection = (): void => run(() => Haptics.selectionAsync());
export const notifySuccess = (): void => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
export const notifyError = (): void => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
