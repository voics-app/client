import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import type { Channel } from '@discordy/core/contracts/rest';
import { entityChoices, type EntityChoice } from '@discordy/core/domain/entityChoices';
import { memberName } from '../members/memberListModel';
import { theme } from '../theme';
import { Field } from '../ui/controls';

/** The people, roles or channels of the chat's server (or the people of a direct conversation) to pick from, with a search field. */
export function EntityPickList({ type, channel, channelTypes, onPick }: { type: number; channel: Channel; channelTypes?: number[] | undefined; onPick(choice: EntityChoice): void }) {
  const guildId = channel.guild_id;
  const members = useGuildStore((s) => (guildId ? s.members[guildId] : undefined));
  const channels = useGuildStore((s) => s.channels);
  const roles = useGuildStore((s) => (guildId ? s.guilds[guildId]?.roles : undefined));
  const [query, setQuery] = useState('');
  const choices = useMemo(() => {
    const users = guildId
      ? Object.values(members ?? {}).map((m) => ({ id: m.user.id, name: memberName(m) }))
      : (channel.recipients ?? []).map((u) => ({ id: u.id, name: u.global_name || u.username }));
    const all = entityChoices(type, { guildId, users, channels: Object.values(channels), roles: roles ?? [], channelTypes });
    const needle = query.trim().toLowerCase();
    return needle ? all.filter((c) => c.label.toLowerCase().includes(needle)) : all;
  }, [type, guildId, members, channel.recipients, channels, roles, channelTypes, query]);

  return (
    <View style={styles.wrap}>
      <View style={styles.search}>
        <Field label="Search" value={query} onChangeText={setQuery} placeholder="Search" />
      </View>
      <FlatList
        data={choices}
        keyExtractor={(c) => `${c.group ?? ''}${c.id}`}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={styles.empty}>Nothing to choose from.</Text>}
        renderItem={({ item, index }) => (
          <View>
            {item.group && choices[index - 1]?.group !== item.group && (
              <Text accessibilityRole="header" style={styles.group}>
                {item.group}
              </Text>
            )}
            <Pressable accessibilityRole="button" accessibilityLabel={item.label} onPress={() => onPick(item)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <Text numberOfLines={1} style={styles.label}>
                {item.label}
              </Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexShrink: 1, maxHeight: 420 },
  search: { paddingHorizontal: 20 },
  group: { color: theme.subtle, fontSize: 11, fontWeight: '600', letterSpacing: 0.66, textTransform: 'uppercase', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  row: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 20 },
  pressed: { backgroundColor: theme.hover },
  label: { color: theme.text, fontSize: 16 },
  empty: { color: theme.muted, textAlign: 'center', padding: 24 },
});
