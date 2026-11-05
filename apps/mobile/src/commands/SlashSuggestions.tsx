import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SlashEntry } from '@discordy/core/domain/slashCommand';
import { theme } from '../theme';

/** The commands that match what is typed after the `/`, above the message field. */
export function SlashSuggestions({ entries, query, appName, onPick }: { entries: SlashEntry[]; query: string; appName(applicationId: string): string | undefined; onPick(entry: SlashEntry): void }) {
  return (
    <View accessibilityLabel="Commands" style={styles.panel}>
      {entries.length === 0 ? (
        <Text style={styles.empty}>{query ? `No command matches "${query}".` : 'No commands here.'}</Text>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.list}>
          {entries.map((entry) => (
            <Pressable key={entry.key} accessibilityRole="button" accessibilityLabel={`Command ${entry.label}`} onPress={() => onPick(entry)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <Text style={styles.name}>{`/${entry.label}`}</Text>
              <Text numberOfLines={1} style={styles.detail}>
                {appName(entry.command.application_id) ?? entry.description}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: theme.raised, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: theme.hairline, overflow: 'hidden' },
  list: { maxHeight: 264 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 14 },
  pressed: { backgroundColor: theme.hover },
  name: { color: theme.text, fontSize: 15, fontWeight: '700' },
  detail: { flex: 1, color: theme.subtle, fontSize: 13, textAlign: 'right' },
  empty: { color: theme.muted, fontSize: 14, padding: 14 },
});
