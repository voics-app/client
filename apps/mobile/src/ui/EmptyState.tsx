import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { radius, space, theme } from '../theme';
import { Button } from './controls';
import { Txt } from './Txt';

export interface EmptyStateProps {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  body?: string;
  /** One call to action under the text, such as "Add friend". */
  action?: { label: string; onPress(): void };
}

/** What a screen shows when a list is empty: a soft icon tile, a headline, one sentence on what goes here and an optional action. */
export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.tile}>
        <Ionicons name={icon} size={28} color={theme.muted} />
      </View>
      <Txt accessibilityRole="header" variant="title" weight="semibold" style={styles.center}>
        {title}
      </Txt>
      {body ? (
        <Txt variant="body" tone="muted" style={styles.center}>
          {body}
        </Txt>
      ) : null}
      {action ? (
        <View style={styles.action}>
          <Button label={action.label} tone="primary" onPress={action.onPress} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space[2], paddingHorizontal: space[6], paddingVertical: space[7] },
  tile: { width: 64, height: 64, borderRadius: radius.panel + 6, backgroundColor: theme.raised, alignItems: 'center', justifyContent: 'center', marginBottom: space[2] },
  center: { textAlign: 'center' },
  action: { marginTop: space[3], alignSelf: 'stretch' },
});
