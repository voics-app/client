import { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import type { QuickEmoji } from '@discordy/core/domain/quickReactions';
import { BRAND } from '../brand';
import { BottomSheet } from '../sheets/BottomSheet';
import { theme } from '../theme';
import { COLUMNS, emojiKey, pickerRows, pickerSections, type PickerRow } from './emojiPickerModel';

export interface EmojiPickerProps {
  visible: boolean;
  /** The server whose custom emoji are offered; none in direct messages. */
  guildId: string | undefined;
  onClose(): void;
  onPick(emoji: QuickEmoji): void;
}

/** A sheet with the recently used, the server's custom and the unicode emoji, and a search field. Picking an emoji closes it. */
export function EmojiPicker({ visible, guildId, onClose, onPick }: EmojiPickerProps) {
  const [query, setQuery] = useState('');
  const recent = usePrefsStore((s) => s.recentReactions);
  const guilds = useGuildStore((s) => s.guilds);
  const rows = useMemo(() => pickerRows(pickerSections({ recent, guilds: Object.values(guilds), guildId, query })), [recent, guilds, guildId, query]);
  const close = () => {
    setQuery('');
    onClose();
  };
  return (
    <BottomSheet visible={visible} onClose={close} label="Emoji" tall>
      <View style={styles.search}>
        <TextInput accessibilityLabel="Search emoji" value={query} onChangeText={setQuery} placeholder="Search emoji" placeholderTextColor={theme.subtle} autoCapitalize="none" autoCorrect={false} style={styles.input} />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={styles.empty}>No emoji found.</Text>}
        renderItem={({ item }) => <Row row={item} onPick={(e) => { setQuery(''); onPick(e); }} />}
      />
    </BottomSheet>
  );
}

function Row({ row, onPick }: { row: PickerRow; onPick(emoji: QuickEmoji): void }) {
  if (row.kind === 'header') {
    return (
      <Text accessibilityRole="header" style={styles.header}>
        {row.title}
      </Text>
    );
  }
  return (
    <View style={styles.row}>
      {row.items.map((emoji) => (
        <Pressable key={emojiKey(emoji)} accessibilityRole="button" accessibilityLabel={emoji.id ? `:${emoji.name}:` : emoji.name} onPress={() => onPick(emoji)} style={styles.cell}>
          {emoji.id ? <Image source={{ uri: `${BRAND.cdnUrl}/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}` }} style={styles.custom} /> : <Text style={styles.glyph}>{emoji.name}</Text>}
        </Pressable>
      ))}
      {Array.from({ length: COLUMNS - row.items.length }, (_, i) => (
        <View key={`spacer${i}`} style={styles.cell} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  search: { paddingHorizontal: 16, paddingBottom: 8 },
  input: { minHeight: 44, borderRadius: 12, backgroundColor: theme.raised, color: theme.text, paddingHorizontal: 14, fontSize: 16 },
  header: { color: theme.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  row: { flexDirection: 'row', paddingHorizontal: 8 },
  cell: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 26 },
  custom: { width: 28, height: 28 },
  empty: { color: theme.muted, textAlign: 'center', padding: 24 },
});
