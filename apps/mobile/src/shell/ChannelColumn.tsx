import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useNotificationSettingsStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { useReadStateStore } from '@discordy/core/application/stores/peopleStores';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { ChannelType, type Channel } from '@discordy/core/contracts/rest';
import { scopeKey } from '@discordy/core/domain/notificationSettings';
import { channelSections } from '../servers/serverModel';
import { metrics, theme } from '../theme';
import { Badge } from './Badge';
import { ColumnHeader } from './ColumnHeader';
import { VoiceChannelList } from '../voice/VoiceChannelList';
import { channelFlags } from './railModel';

function ChannelRow({ channel, guildId, active }: { channel: Channel; guildId: string; active: boolean }) {
  const read = useReadStateStore((s) => s.byChannel[channel.id]);
  const settings = useNotificationSettingsStore((s) => s.byScope[scopeKey(guildId)]);
  const { unread, muted, mentions } = channelFlags(channel, read, settings, Date.now());
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open #${channel.name}`}
      accessibilityState={{ selected: active }}
      onPress={() => router.push(`/servers/${guildId}/${channel.id}`)}
      style={[styles.row, active && styles.rowActive, muted && styles.muted]}
    >
      {unread && <View testID="channel-unread" style={styles.unreadDot} />}
      {channel.type === ChannelType.GUILD_ANNOUNCEMENT ? (
        <Ionicons name="megaphone-outline" size={18} color={active || unread ? theme.text : theme.subtle} />
      ) : (
        <Text style={[styles.hash, (active || unread) && styles.nameOn]}>#</Text>
      )}
      <Text numberOfLines={1} style={[styles.name, (active || unread) && styles.nameOn, unread && styles.nameUnread]}>
        {channel.name}
      </Text>
      <Badge value={mentions} />
    </Pressable>
  );
}

/** Desktop's ChannelSidebar for one server: its name, then channels by category (collapsible), with the open channel, unread and muted states. */
export function ChannelColumn({ guildId }: { guildId: string }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const channels = useGuildStore((s) => s.channels);
  const members = useGuildStore((s) => s.members[guildId]);
  const userId = useSessionStore((s) => s.user?.id);
  const activeChannelId = useUiStore((s) => (s.view.kind === 'guild' && s.view.guildId === guildId ? s.view.channelId : null));
  const collapsed = usePrefsStore((s) => s.collapsedCategories);

  const sections = useMemo(
    () => (guild && userId ? channelSections({ guild, channels, members, userId }) : []),
    [guild, channels, members, userId],
  );

  return (
    <>
      <ColumnHeader title={guild?.name ?? ''} />
      <SectionList
        style={styles.list}
        contentContainerStyle={styles.content}
        sections={sections.map((s) => ({ key: s.id ?? 'loose', id: s.id, title: s.title, data: s.id && collapsed[s.id] ? [] : s.channels }))}
        keyExtractor={(channel) => channel.id}
        ListFooterComponent={<VoiceChannelList guildId={guildId} />}
        ListEmptyComponent={<Text style={styles.empty}>{guild ? 'No text channels you can see.' : 'This server is not available.'}</Text>}
        renderSectionHeader={({ section }) =>
          section.title === null ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${section.title} category`}
              accessibilityState={{ expanded: !(section.id && collapsed[section.id]) }}
              onPress={() => section.id && usePrefsStore.getState().toggleMap('collapsedCategories', section.id)}
              style={styles.category}
            >
              <Ionicons name={section.id && collapsed[section.id] ? 'chevron-forward' : 'chevron-down'} size={12} color={theme.subtle} />
              <Text style={styles.categoryText}>{section.title.toUpperCase()}</Text>
            </Pressable>
          )
        }
        renderItem={({ item }) => <ChannelRow channel={item} guildId={guildId} active={item.id === activeChannelId} />}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: { paddingHorizontal: 8, paddingBottom: 16 },
  category: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 22, marginTop: 14, paddingHorizontal: 4 },
  categoryText: { color: theme.subtle, fontSize: 11, fontWeight: '600', letterSpacing: 0.66 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, height: metrics.channelRowHeight, marginVertical: 1, paddingHorizontal: 8, borderRadius: 8 },
  rowActive: { backgroundColor: theme.accentSoft },
  muted: { opacity: 0.55 },
  unreadDot: { position: 'absolute', left: -8, top: 12, width: 4, height: 8, borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: theme.text },
  hash: { color: theme.subtle, fontSize: 18, width: 18, textAlign: 'center' },
  name: { flex: 1, color: theme.subtle, fontSize: 15 },
  nameOn: { color: theme.text },
  nameUnread: { fontWeight: '600' },
  empty: { color: theme.subtle, fontSize: 13, padding: 16 },
});
