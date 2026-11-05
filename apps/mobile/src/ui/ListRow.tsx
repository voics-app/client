import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  /** Without it the row is not a button and shows no chevron. */
  onPress?: () => void;
  danger?: boolean;
  accessibilityLabel?: string;
}

/** A settings-style row: optional leading element, title and subtitle, optional trailing element, chevron when it opens something. */
export function ListRow({ title, subtitle, left, right, onPress, danger, accessibilityLabel }: ListRowProps) {
  const body = (
    <>
      {left}
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.title, danger && styles.danger]}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={2} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {onPress && <Ionicons name="chevron-forward" size={16} color={theme.subtle} />}
    </>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {body}
    </Pressable>
  ) : (
    <View style={styles.row}>{body}</View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16, paddingVertical: 8 },
  pressed: { backgroundColor: theme.hover },
  copy: { flex: 1 },
  title: { color: theme.text, fontSize: 16 },
  danger: { color: theme.danger },
  subtitle: { color: theme.subtle, fontSize: 13, marginTop: 2 },
});
