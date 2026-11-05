import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useNotificationSettingsStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { useReadStateStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { scopeKey } from '@discordy/core/domain/notificationSettings';
import { Permission } from '@discordy/core/contracts/permissions';
import { hasPermission } from '@discordy/core/domain/permissions';
import { channelSections, channelsInSection } from '../servers/serverModel';
import { useGuildPermissions } from '../servers/useGuildPermissions';
import { theme } from '../theme';
import { ChannelRow } from './ChannelRow';
import { ColumnHeader } from './ColumnHeader';
import { ServerMenu } from './ServerMenu';

/** Desktop's ChannelSidebar for one server: its name (opens the server menu), then channels of every kind by category (collapsible), with the open channel, unread and muted states and who is in each voice channel. */
export function ChannelColumn({ guildId }: { guildId: string }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const channels = useGuildStore((s) => s.channels);
  const members = useGuildStore((s) => s.members[guildId]);
  const userId = useSessionStore((s) => s.user?.id);
  const activeChannelId = useUiStore((s) => (s.view.kind === 'guild' && s.view.guildId === guildId ? s.view.channelId : null));
  const collapsed = usePrefsStore((s) => s.collapsedCategories);
  const reads = useReadStateStore((s) => s.byChannel);
  const settings = useNotificationSettingsStore((s) => s.byScope[scopeKey(guildId)]);
  const voiceStates = useVoiceStore((s) => s.states);
  const canMoveMembers = hasPermission(useGuildPermissions(guildId), Permission.MOVE_MEMBERS);
  const [menuOpen, setMenuOpen] = useState(false);

  const sections = useMemo(
    () => (guild && userId ? channelSections({ guild, channels, members, userId }) : []),
    [guild, channels, members, userId],
  );

  return (
    <>
      <ColumnHeader title={guild?.name ?? ''} onPressTitle={guild ? () => setMenuOpen(true) : undefined} />
      <ServerMenu guildId={guildId} visible={menuOpen} onClose={() => setMenuOpen(false)} />
      <SectionList
        style={styles.list}
        contentContainerStyle={styles.content}
        sections={sections.map((s) => ({ key: s.id ?? 'loose', id: s.id, title: s.title, data: channelsInSection(s.channels, { collapsed: Boolean(s.id && collapsed[s.id]), activeId: activeChannelId, reads, settings, voiceStates, now: Date.now() }) }))}
        keyExtractor={(channel) => channel.id}
        ListEmptyComponent={<Text style={styles.empty}>{guild ? 'No channels you can see.' : 'This server is not available.'}</Text>}
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
        renderItem={({ item }) => <ChannelRow channel={item} guildId={guildId} active={item.id === activeChannelId} canMoveMembers={canMoveMembers} />}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: { paddingHorizontal: 8, paddingBottom: 16 },
  category: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 22, marginTop: 14, paddingHorizontal: 4 },
  categoryText: { color: theme.subtle, fontSize: 11, fontWeight: '600', letterSpacing: 0.66 },
  empty: { color: theme.subtle, fontSize: 13, padding: 16 },
});
