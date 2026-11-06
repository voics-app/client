import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Dimensions, Keyboard, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming, Extrapolation } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { BACKDROP_OPACITY, CLOSE_MS, OPEN_MS, shouldDismiss } from './sheetMotion';
import { useReduceMotion } from './useReduceMotion';

export interface BottomSheetProps {
  visible: boolean;
  onClose(): void;
  /** Spoken name of the sheet. */
  label: string;
  /** Accessibility label of the backdrop button; defaults to `Close <label>`. */
  closeLabel?: string;
  children: ReactNode;
  /** Fill most of the screen instead of fitting the content (long text, pickers). */
  tall?: boolean;
}

const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * One bottom sheet for the whole app. The dim backdrop fades on its own while only the sheet slides, so an open keyboard never shows a black
 * layer riding along. Dragging the handle (or the header area) follows the finger on the UI thread and a flick or a long drag dismisses it;
 * a text field in the sheet lifts it with the keyboard frame by frame. Tap outside to dismiss; the keyboard closes first.
 */
export function BottomSheet({ visible, onClose, label, closeLabel, children, tall }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const screen = Dimensions.get('window').height;
  const [mounted, setMounted] = useState(visible);
  const y = useSharedValue(screen);
  const sheetHeight = useSharedValue(screen);
  const laidOut = useSharedValue(false);
  const keyboard = useReanimatedKeyboardAnimation();

  const unmount = useCallback(() => setMounted(false), []);
  const duration = useCallback((ms: number) => (reduceMotion ? 0 : ms), [reduceMotion]);

  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();
      y.value = screen;
      laidOut.value = false;
      setMounted(true);
    } else if (mounted) {
      y.value = withTiming(screen, { duration: duration(CLOSE_MS), easing: EASE_OUT }, (finished) => finished && scheduleOnRN(unmount));
    }
    // `mounted` and `screen` only seed the transition; the effect must run on visibility changes alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pan = Gesture.Pan()
    .activeOffsetY([-6, 6])
    .onUpdate((e) => {
      y.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (shouldDismiss(e.translationY, e.velocityY / 1000)) scheduleOnRN(onClose);
      else y.value = withTiming(0, { duration: duration(CLOSE_MS), easing: EASE_OUT });
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value + keyboard.height.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [0, sheetHeight.value], [BACKDROP_OPACITY, 0], Extrapolation.CLAMP) }));

  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.root} pointerEvents="box-none">
        <Animated.View testID="sheet-backdrop" style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
        <Pressable accessibilityRole="button" accessibilityLabel={closeLabel ?? `Close ${label}`} style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          accessibilityLabel={label}
          onLayout={(e) => {
            sheetHeight.value = e.nativeEvent.layout.height;
            if (!laidOut.value) {
              laidOut.value = true;
              y.value = withTiming(0, { duration: duration(OPEN_MS), easing: EASE_OUT });
            }
          }}
          style={[styles.sheet, tall && styles.tall, { paddingBottom: Math.max(insets.bottom, 12) }, sheetStyle]}
        >
          <GestureDetector gesture={pan}>
            <View style={styles.handleArea} accessibilityLabel="Drag down to close">
              <View style={styles.handle} />
            </View>
          </GestureDetector>
          {children}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: '#000000' },
  sheet: { backgroundColor: theme.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%', borderTopWidth: 1, borderColor: theme.hairline },
  tall: { height: '88%' },
  handleArea: { height: 32, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: theme.hairlineStrong },
});
