import type { ComponentProps } from 'react';
import { useState } from 'react';
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useReduceMotion } from '../sheets/useReduceMotion';

/** Desktop's buttons scale to 0.97 on press; the phone does the same, on the UI thread, in 150 ms. */
export const PRESS_SCALE = 0.97;
const FAST_MS = 150;

export interface PressableScaleProps extends ComponentProps<typeof Pressable> {
  /** Full-width rows are only tinted, not scaled: shrinking a row that fills the screen looks like a layout glitch. */
  scale?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** A Pressable with press feedback: a scale to 0.97 (off with Reduce Motion or `scale={false}`) and the `pressed` state for styling. */
export function PressableScale({ style, scale = true, onPressIn, onPressOut, ...rest }: PressableScaleProps) {
  const reduceMotion = useReduceMotion();
  // Reanimated components take plain style values, not Pressable's style function, so the pressed state is tracked here.
  const [pressed, setPressed] = useState(false);
  const factor = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: factor.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        setPressed(true);
        if (scale && !reduceMotion) factor.value = withTiming(PRESS_SCALE, { duration: FAST_MS });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        factor.value = withTiming(1, { duration: FAST_MS });
        onPressOut?.(e);
      }}
      style={[typeof style === 'function' ? style({ pressed, hovered: false }) : style, animated]}
    />
  );
}
