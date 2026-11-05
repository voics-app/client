import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { tapLight } from '../haptics';
import { theme } from '../theme';
import { useReduceMotion } from '../sheets/useReduceMotion';
import { isSwipeStart, pastThreshold, swipeOffset, swipeProgress } from './swipeModel';

/**
 * Drag a message left to reply: it follows the finger, a reply icon fades in, a light haptic marks the threshold and letting go past it replies.
 * With Reduce Motion on the message stays put and only the icon shows.
 */
export function SwipeToReply({ onReply, children }: { onReply(): void; children: ReactNode }) {
  const reduceMotion = useReduceMotion();
  const x = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const crossed = useRef(false);
  const callbacks = useRef({ onReply, reduceMotion });
  callbacks.current = { onReply, reduceMotion };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => isSwipeStart(g.dx, g.dy),
        onPanResponderMove: (_, g) => {
          x.setValue(callbacks.current.reduceMotion ? 0 : swipeOffset(g.dx));
          progress.setValue(swipeProgress(g.dx));
          const past = pastThreshold(g.dx);
          if (past && !crossed.current) tapLight();
          crossed.current = past;
        },
        onPanResponderRelease: (_, g) => {
          if (pastThreshold(g.dx)) callbacks.current.onReply();
          crossed.current = false;
          Animated.parallel([
            Animated.timing(x, { toValue: 0, duration: callbacks.current.reduceMotion ? 0 : 150, useNativeDriver: true }),
            Animated.timing(progress, { toValue: 0, duration: callbacks.current.reduceMotion ? 0 : 150, useNativeDriver: true }),
          ]).start();
        },
        onPanResponderTerminate: () => {
          crossed.current = false;
          x.setValue(0);
          progress.setValue(0);
        },
      }),
    [x, progress],
  );

  return (
    <View>
      <Animated.View pointerEvents="none" style={[styles.icon, { opacity: progress, transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}>
        <Ionicons name="arrow-undo" size={20} color={theme.accentText} />
      </Animated.View>
      <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: x }] }}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { position: 'absolute', right: 16, top: '50%', marginTop: -16, width: 32, height: 32, borderRadius: 16, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
});
