import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useNotificationSettingsStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { useReadStateStore, useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { MODE_LABELS, rankItems, recentChannelIds } from '@discordy/core/domain/quickSwitcher';
import { dmTitle } from '../dms/dmModel';
import { Badge } from '../shell/Badge';
import { openChat, openGuild } from '../navigation/openChat';
import { BottomSheet } from '../sheets/BottomSheet';
import { theme } from '../theme';
import { switcherItems, type MobileSwitcherItem, type SwitcherTarget } from './switcherModel';

export const SWITCHER_HINT = '@ people   # text   ! voice   * servers';

/** Goes where a result points: a chat, a server's channel list, or a screen. */
export function runTarget(target: SwitcherTarget): void {
  if (target.kind === 'chat') openChat({ guildId: target.guildId, channelId: target.channelId });
  else if (target.kind === 'guild') openGuild(target.guildId);
  else router.push(target.path);
}

function Row({ item, onPress }: { item: MobileSwitcherItem; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={item.hint ? `${item.label}, ${item.hint}` : item.label} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {item.glyph ? <Ionicons name={item.glyph} size={20} color={theme.muted} /> : <Text style={styles.hash}>#</Text>}
      <Text numberOfLines={1} style={[styles.label, item.unread && styles.unread]}>
        {item.label.replace(/^#/, '')}
      </Text>
      {item.hint ? (
        <Text numberOfLines={1} style={styles.hint}>
          {item.hint}
        </Text>
      ) : null}
      {item.unread && !(item.mentions ?? 0) ? <View testID="switcher-unread" style={styles.dot} /> : null}
      <Badge value={item.mentions ?? 0} />
    </Pressable>
  );
}

/** Desktop's quick switcher (Ctrl+K) as a sheet: type to jump to any channel, person or server. A leading `@`, `#`, `!` or `*` narrows the search, as on desktop; with nothing typed, chats with mentions, then unread, then recent ones come first. */
export function QuickSwitcher() {
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.openPalette);
  const history = useUiStore((s) => s.history);
  const channels = useGuildStore((s) => s.channels);
  const guilds = useGuildStore((s) => s.guilds);
  const reads = useReadStateStore((s) => s.byChannel);
  const settingsByScope = useNotificationSettingsStore((s) => s.byScope);
  const relationships = useRelationshipStore((s) => s.byUser);
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const items = useMemo(
    () => (open ? switcherItems({ channels, guilds, reads, settingsByScope, recents: recentChannelIds(history.entries), dmName: (c) => dmTitle(c, relationships), now: Date.now() }) : []),
    [open, channels, guilds, reads, settingsByScope, history, relationships],
  );
  const ranked = useMemo(() => rankItems(items, query), [items, query]);
  const close = () => setOpen(false);
  const choose = (item: MobileSwitcherItem) => {
    close();
    runTarget(item.target);
  };

  return (
    <BottomSheet visible={open} onClose={close} label="Quick switcher" tall>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={theme.muted} />
        {ranked.mode !== 'all' && (
          <Text accessibilityLabel={`Searching ${MODE_LABELS[ranked.mode]}`} style={styles.mode}>
            {MODE_LABELS[ranked.mode]}
          </Text>
        )}
        <TextInput
          accessibilityLabel="Quick switcher search"
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={() => ranked.items[0] && choose(ranked.items[0])}
          placeholder="Jump to a channel, person or server"
          placeholderTextColor={theme.subtle}
        />
      </View>
      <Text style={styles.prefixes}>{SWITCHER_HINT}</Text>
      <FlatList
        data={ranked.items}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={styles.empty}>Nothing matches.</Text>}
        renderItem={({ item, index }) => (
          <View>
            {(index === 0 || ranked.items[index - 1]!.group !== item.group) && (
              <Text accessibilityRole="header" style={styles.group}>
                {item.group}
              </Text>
            )}
            <Row item={item} onPress={() => choose(item)} />
          </View>
        )}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, paddingHorizontal: 12, minHeight: 44, borderRadius: 12, backgroundColor: theme.raised },
  mode: { color: theme.accent, fontSize: 12, fontWeight: '700' },
  input: { flex: 1, minHeight: 44, color: theme.text, fontSize: 16 },
  prefixes: { color: theme.subtle, fontSize: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  group: { color: theme.subtle, fontSize: 11, fontWeight: '600', letterSpacing: 0.66, textTransform: 'uppercase', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 20 },
  pressed: { backgroundColor: theme.hover },
  hash: { color: theme.muted, fontSize: 18, width: 20, textAlign: 'center' },
  label: { flexShrink: 1, color: theme.text, fontSize: 16 },
  unread: { fontWeight: '700' },
  hint: { flex: 1, color: theme.subtle, fontSize: 13 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.text },
  empty: { color: theme.muted, textAlign: 'center', padding: 24 },
});
