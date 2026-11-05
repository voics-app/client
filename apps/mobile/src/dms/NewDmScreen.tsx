import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { dmCandidates } from '@discordy/core/application/dmCandidates';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { Avatar } from '../profile/Avatar';
import { theme } from '../theme';
import { Field, Notice, TextButton } from '../ui/controls';
import { openConversation } from './dmActions';
import { confirmLabel, filterCandidates, MAX_RECIPIENTS, toggleRecipient } from './newDmModel';

const nameOf = (user: { username: string; global_name?: string | null }, nick?: string | null) => nick || user.global_name || user.username;

/** New message and New group DM in one picker, as on desktop: friends first, then people from your servers. One person opens their DM, several make a group. */
export function NewDmScreen() {
  const meId = useSessionStore((s) => s.user?.id);
  const members = useGuildStore((s) => s.members);
  const channels = useGuildStore((s) => s.channels);
  const relationships = useRelationshipStore((s) => s.byUser);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const candidates = useMemo(() => dmCandidates({ meId, members, channels, relationships, displayName: nameOf }), [meId, members, channels, relationships]);
  const rows = useMemo(() => filterCandidates(candidates, query), [candidates, query]);
  const label = confirmLabel(selected.length);
  const names = new Map(candidates.map((c) => [c.id, c.name]));

  const submit = async () => {
    setBusy(true);
    const id = await openConversation(selected);
    setBusy(false);
    if (id) router.replace(`/dms/${id}`);
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: selected.length > 1 ? 'New group' : 'New message', headerRight: () => (label && !busy ? <TextButton label={label} onPress={() => void submit()} /> : null) }} />
      <View style={styles.search}>
        <Field label="To" value={query} onChangeText={setQuery} placeholder="Search friends and people" returnKeyType="search" />
        {selected.length > 0 && <Text style={styles.chips}>{selected.map((id) => names.get(id) ?? id).join(', ')}</Text>}
        {selected.length >= MAX_RECIPIENTS && <Text style={styles.chips}>{`A group takes up to ${MAX_RECIPIENTS} people besides you.`}</Text>}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Notice>{query ? 'Nobody matches.' : 'Add friends or join a server to start a conversation.'}</Notice>}
        renderItem={({ item }) => {
          const on = selected.includes(item.id);
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={item.name}
              accessibilityState={{ checked: on }}
              onPress={() => setSelected((current) => toggleRecipient(current, item.id))}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Avatar user={{ id: item.id, avatar: item.avatar, username: item.name, global_name: item.name }} size={40} />
              <Text numberOfLines={1} style={styles.name}>
                {item.name}
              </Text>
              <Ionicons name={on ? 'checkbox' : 'square-outline'} size={24} color={on ? theme.accent : theme.subtle} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  search: { paddingHorizontal: 16, paddingTop: 12 },
  chips: { color: theme.muted, fontSize: 13, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16 },
  pressed: { backgroundColor: theme.hover },
  name: { flex: 1, color: theme.text, fontSize: 16 },
});
