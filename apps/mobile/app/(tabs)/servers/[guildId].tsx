import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { channelSections } from '../../../src/servers/serverModel';
import { theme } from '../../../src/theme';

export default function ChannelListScreen() {
  const { guildId } = useLocalSearchParams<{ guildId: string }>();
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const channels = useGuildStore((s) => s.channels);
  const members = useGuildStore((s) => s.members[guildId]);
  const userId = useSessionStore((s) => s.user?.id);

  const sections = useMemo(
    () => (guild && userId ? channelSections({ guild, channels, members, userId }) : []),
    [guild, channels, members, userId],
  );

  return (
    <>
      <Stack.Screen options={{ title: guild?.name ?? '' }} />
      <SectionList
        style={styles.list}
        sections={sections.map((s) => ({ key: s.id ?? 'loose', title: s.title, data: s.channels }))}
        keyExtractor={(channel) => channel.id}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{guild ? 'No text channels you can see.' : 'This server is not available.'}</Text>
          </View>
        }
        renderSectionHeader={({ section }) => (section.title ? <Text style={styles.category}>{section.title.toUpperCase()}</Text> : null)}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.hash}>#</Text>
            <Text style={styles.name}>{item.name}</Text>
          </View>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: theme.background },
  category: { color: theme.muted, fontSize: 12, fontWeight: '700', paddingHorizontal: 14, paddingTop: 18, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  hash: { color: theme.muted, fontSize: 18 },
  name: { color: theme.text, fontSize: 16, flexShrink: 1 },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: theme.muted },
});
