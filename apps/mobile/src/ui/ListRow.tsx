import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { HIT, space, theme } from '../theme';
import { PressableScale } from './PressableScale';
import { Txt } from './Txt';

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

/** A settings-style row, at least 52 pt tall: optional leading element, title and subtitle, optional trailing element, chevron when it opens something. Pressing tints it. */
export function ListRow({ title, subtitle, left, right, onPress, danger, accessibilityLabel }: ListRowProps) {
  const body = (
    <>
      {left}
      <View style={styles.copy}>
        <Txt numberOfLines={1} variant="body" tone={danger ? 'danger' : 'text'}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt numberOfLines={2} variant="small" tone="subtle" style={styles.subtitle}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right}
      {onPress && <Ionicons name="chevron-forward" size={16} color={theme.subtle} />}
    </>
  );
  return onPress ? (
    <PressableScale scale={false} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {body}
    </PressableScale>
  ) : (
    <View style={styles.row}>{body}</View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: HIT + 8, paddingHorizontal: space[4], paddingVertical: space[2] },
  pressed: { backgroundColor: theme.hover },
  copy: { flex: 1 },
  subtitle: { marginTop: 2 },
});
