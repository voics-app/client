import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useReduceMotion } from '../sheets/useReduceMotion';
import { radius, space, theme } from '../theme';

/** One swing (dim to bright) takes this long; the shimmer is a slow opacity pulse, calm enough to sit on screen for seconds. */
const PULSE_MS = 900;

/** A grey placeholder block that pulses (still with Reduce Motion), shown where content is on its way. */
export function Skeleton({ width, height, round = false, style }: { width?: DimensionValue; height: number; round?: boolean; style?: StyleProp<ViewStyle> }) {
  const reduceMotion = useReduceMotion();
  const level = useSharedValue(0.55);
  useEffect(() => {
    if (reduceMotion) {
      level.value = 0.7;
      return;
    }
    level.value = withRepeat(withTiming(1, { duration: PULSE_MS, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(level);
  }, [reduceMotion, level]);
  const animated = useAnimatedStyle(() => ({ opacity: level.value }));
  return <Animated.View style={[styles.block, { height, borderRadius: round ? height / 2 : radius.chip }, width !== undefined && { width }, style, animated]} />;
}

/** The loading state of a chat: avatar circles with a name line and one or two text lines, filling up from the bottom like the real list. */
export function MessageSkeletons({ count = 6 }: { count?: number }) {
  return (
    <View accessibilityLabel="Loading messages" accessibilityRole="progressbar" style={styles.messages}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.message}>
          <Skeleton width={40} height={40} round />
          <View style={styles.lines}>
            <Skeleton width={60 + ((i * 37) % 80)} height={12} />
            <Skeleton width={`${55 + ((i * 23) % 40)}%`} height={12} />
            {i % 2 === 0 && <Skeleton width={`${30 + ((i * 17) % 40)}%`} height={12} />}
          </View>
        </View>
      ))}
    </View>
  );
}

/** The loading state of a list of rows (avatar, title, subtitle), as in friends, DMs and members. */
export function RowSkeletons({ count = 6, avatar = true }: { count?: number; avatar?: boolean }) {
  return (
    <View accessibilityLabel="Loading" accessibilityRole="progressbar" style={styles.rows}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.row}>
          {avatar && <Skeleton width={40} height={40} round />}
          <View style={styles.lines}>
            <Skeleton width={`${40 + ((i * 29) % 40)}%`} height={14} />
            <Skeleton width={`${25 + ((i * 19) % 30)}%`} height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: theme.raisedHover },
  messages: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: space[4], paddingBottom: space[4], gap: space[4] },
  message: { flexDirection: 'row', gap: space[4] },
  lines: { flex: 1, gap: space[2], justifyContent: 'center' },
  rows: { paddingHorizontal: space[4], paddingTop: space[3], gap: space[4] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
});
