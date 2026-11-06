import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { tapLight } from '../haptics';
import { theme } from '../theme';
import { useReduceMotion } from '../sheets/useReduceMotion';
import { pastThreshold, SWIPE_FAIL_Y, SWIPE_START, swipeOffset, swipeProgress } from './swipeModel';

/**
 * Drag a message left to reply: it follows the finger on the UI thread, a reply icon fades in, a light haptic marks the threshold and letting go past it replies.
 * Vertical movement hands the touch to the list first, so scrolling never starts a swipe. With Reduce Motion on the message stays put and only the icon shows.
 */
export function SwipeToReply({ onReply, children }: { onReply(): void; children: ReactNode }) {
  const reduceMotion = useReduceMotion();
  const x = useSharedValue(0);
  const progress = useSharedValue(0);
  const crossed = useSharedValue(false);

  const pan = Gesture.Pan()
    .activeOffsetX(-SWIPE_START)
    .failOffsetY([-SWIPE_FAIL_Y, SWIPE_FAIL_Y])
    .onUpdate((e) => {
      x.value = reduceMotion ? 0 : swipeOffset(e.translationX);
      progress.value = swipeProgress(e.translationX);
      const past = pastThreshold(e.translationX);
      if (past && !crossed.value) scheduleOnRN(tapLight);
      crossed.value = past;
    })
    .onEnd((e) => {
      if (pastThreshold(e.translationX)) scheduleOnRN(onReply);
    })
    .onFinalize(() => {
      crossed.value = false;
      const timing = { duration: reduceMotion ? 0 : 150 };
      x.value = withTiming(0, timing);
      progress.value = withTiming(0, timing);
    });

  const iconStyle = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ scale: interpolate(progress.value, [0, 1], [0.6, 1]) }] }));
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View>
      <Animated.View pointerEvents="none" style={[styles.icon, iconStyle]}>
        <Ionicons name="arrow-undo" size={20} color={theme.accentText} />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { position: 'absolute', right: 16, top: '50%', marginTop: -16, width: 32, height: 32, borderRadius: 16, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
});
