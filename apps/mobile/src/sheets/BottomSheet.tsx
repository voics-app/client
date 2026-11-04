import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Dimensions, Easing, Keyboard, Modal, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { BACKDROP_OPACITY, CLOSE_MS, OPEN_MS, shouldDismiss } from './sheetMotion';
import { useReduceMotion } from './useReduceMotion';

export interface BottomSheetProps {
  visible: boolean;
  onClose(): void;
  /** Spoken name of the sheet. */
  label: string;
  children: ReactNode;
  /** Fill most of the screen instead of fitting the content (long text, pickers). */
  tall?: boolean;
}

const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * One bottom sheet for the whole app. The dim backdrop fades in on its own while only the sheet slides up, so an open keyboard never shows
 * a black layer riding along. Tap outside or drag the handle down to dismiss; the keyboard closes first.
 */
export function BottomSheet({ visible, onClose, label, children, tall }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const screen = Dimensions.get('window').height;
  const [mounted, setMounted] = useState(visible);
  const [sheetHeight, setSheetHeight] = useState(screen);
  const y = useRef(new Animated.Value(screen)).current;
  const laidOut = useRef(false);

  const animateTo = useCallback(
    (to: number, ms: number, done?: () => void) => {
      Animated.timing(y, { toValue: to, duration: reduceMotion ? 0 : ms, easing: EASE_OUT, useNativeDriver: true }).start(({ finished }) => finished && done?.());
    },
    [y, reduceMotion],
  );

  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();
      y.setValue(screen);
      laidOut.current = false;
      setMounted(true);
    } else if (mounted) {
      animateTo(screen, CLOSE_MS, () => setMounted(false));
    }
    // `mounted` and `screen` only seed the transition; the effect must run on visibility changes alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
        onPanResponderMove: (_, g) => y.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (shouldDismiss(g.dy, g.vy)) onClose();
          else animateTo(0, CLOSE_MS);
        },
        onPanResponderTerminate: () => animateTo(0, CLOSE_MS),
      }),
    [y, onClose, animateTo],
  );

  if (!mounted) return null;
  const backdrop = y.interpolate({ inputRange: [0, sheetHeight], outputRange: [BACKDROP_OPACITY, 0], extrapolate: 'clamp' });
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root} pointerEvents="box-none">
        <Animated.View testID="sheet-backdrop" style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdrop }]} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Close ${label}`} style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          accessibilityLabel={label}
          onLayout={(e) => {
            setSheetHeight(e.nativeEvent.layout.height);
            if (!laidOut.current) {
              laidOut.current = true;
              animateTo(0, OPEN_MS);
            }
          }}
          style={[styles.sheet, tall && styles.tall, { paddingBottom: Math.max(insets.bottom, 12), transform: [{ translateY: y }] }]}
        >
          <View {...pan.panHandlers} style={styles.handleArea} accessibilityLabel="Drag down to close">
            <View style={styles.handle} />
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: '#000000' },
  sheet: { backgroundColor: theme.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%', borderTopWidth: 1, borderColor: theme.hairline },
  tall: { height: '88%' },
  handleArea: { height: 28, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: theme.hairlineStrong },
});
