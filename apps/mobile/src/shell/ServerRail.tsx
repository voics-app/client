import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useNotificationSettingsStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { useReadStateStore } from '@discordy/core/application/stores/peopleStores';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import type { GuildFolder } from '@discordy/core/contracts/rest';
import { folderLabel } from '@discordy/core/domain/railLayout';
import { scopeKey } from '@discordy/core/domain/notificationSettings';
import { openGuild } from '../navigation/openChat';
import { AddServerSheet } from '../servers/AddServerSheet';
import { RailMenu, type RailTarget } from './RailMenu';
import { metrics, theme } from '../theme';
import { Badge } from './Badge';
import { PressableScale } from '../ui/PressableScale';
import { unreadDms, type UnreadDm } from '@discordy/core/domain/unreadDms';
import { DM_SCOPE, isChannelMuted } from '@discordy/core/domain/notificationSettings';
import { useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { dmTitle } from '../dms/dmModel';
import { openChat } from '../navigation/openChat';
import { Avatar } from '../profile/Avatar';
import { ServerIcon } from './ServerIcon';
import { dmMentionTotal, guildActivity, initialsOf, type Activity } from './railModel';

/** Unread and mention totals over a set of servers (one server, or a folder's badge). */
function useActivity(guildIds: string[]): Activity {
  const channels = useGuildStore((s) => s.channels);
  const reads = useReadStateStore((s) => s.byChannel);
  const byScope = useNotificationSettingsStore((s) => s.byScope);
  const key = guildIds.join(',');
  return useMemo(
    () => guildActivity(channels, reads, (id) => byScope[scopeKey(id)], new Set(key ? key.split(',') : []), Date.now()),
    [channels, reads, byScope, key],
  );
}

interface RailItemProps {
  label: string;
  active: boolean;
  unread: boolean;
  mentions: number;
  onPress: () => void;
  /** Opens the menu that reorders and groups; a long press, as touch has no dragging here. */
  onLongPress?: () => void;
  tile: (active: boolean) => ReactNode;
  expanded?: boolean;
}

/** One rail slot: the left-edge pill (selected) or pip (unread), the tile and the mention badge, laid out like desktop's `.rail-item`. */
function RailItem({ label, active, unread, mentions, onPress, onLongPress, tile, expanded }: RailItemProps) {
  return (
    <View style={styles.item}>
      {active ? <View testID="rail-pill" style={styles.pill} /> : unread && <View testID="rail-pip" style={styles.pip} />}
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: active, ...(expanded === undefined ? {} : { expanded }) }}
        onPress={onPress}
        {...(onLongPress ? { onLongPress, delayLongPress: 350 } : {})}
        style={({ pressed }) => [styles.tile, active && styles.tileActive, pressed && styles.tilePressed]}
      >
        {tile(active)}
      </PressableScale>
      {mentions > 0 && (
        <View style={styles.badge}>
          <Badge value={mentions} ring />
        </View>
      )}
    </View>
  );
}

/** A conversation with unread messages, above the servers: the person's avatar with the number of new messages. */
function UnreadDmItem({ dm }: { dm: UnreadDm }) {
  const relationships = useRelationshipStore((s) => s.byUser);
  const recipients = dm.channel.recipients ?? [];
  const peer = recipients.length === 1 ? recipients[0]! : null;
  return (
    <RailItem
      label={`${dmTitle(dm.channel, relationships)}, ${dm.count} unread`}
      active={false}
      unread={false}
      mentions={dm.count}
      onPress={() => openChat({ channelId: dm.channel.id })}
      tile={() => (peer ? <Avatar user={peer} size={metrics.serverTile} /> : <Ionicons name="people" size={24} color={theme.muted} />)}
    />
  );
}

function GuildItem({ guildId, active, onEdit }: { guildId: string; active: boolean; onEdit(target: RailTarget): void }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const { unread, mentions } = useActivity([guildId]);
  if (!guild) return null;
  return (
    <RailItem
      label={guild.name}
      active={active}
      unread={unread && !active}
      mentions={mentions}
      onPress={() => openGuild(guildId)}
      onLongPress={() => onEdit({ kind: 'guild', id: guildId })}
      tile={(selected) => <ServerIcon guild={guild} active={selected} />}
    />
  );
}

function FolderItem({ folder, activeGuildId, onEdit }: { folder: GuildFolder; activeGuildId: string | null; onEdit(target: RailTarget): void }) {
  const key = `folder-${folder.id}`;
  const closed = usePrefsStore((s) => s.collapsedCategories[key] ?? false);
  const guilds = useGuildStore((s) => s.guilds);
  const activity = useActivity(folder.guild_ids);
  const containsActive = activeGuildId !== null && folder.guild_ids.includes(activeGuildId);
  const label = folderLabel(folder, (id) => guilds[id]?.name);
  return (
    <View>
      <RailItem
        label={`${label} folder`}
        active={false}
        unread={closed && activity.unread && !containsActive}
        mentions={closed ? activity.mentions : 0}
        expanded={!closed}
        onPress={() => usePrefsStore.getState().toggleMap('collapsedCategories', key)}
        onLongPress={() => onEdit({ kind: 'folder', id: folder.id! })}
        tile={() =>
          closed ? (
            <View style={styles.folderGrid}>
              {folder.guild_ids.slice(0, 4).map((id) => (
                <View key={id} style={styles.folderCell}>
                  <Text style={styles.folderInitial}>{initialsOf(guilds[id]?.name ?? '').slice(0, 1)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Ionicons name="folder" size={24} color={folder.color ? `#${folder.color.toString(16).padStart(6, '0')}` : theme.muted} />
          )
        }
      />
      {!closed && folder.guild_ids.map((id) => <GuildItem key={id} guildId={id} active={activeGuildId === id} onEdit={onEdit} />)}
    </View>
  );
}

/** Desktop's ServerRail: Direct messages on top, a separator, then servers and folders in the user's order. */
export function ServerRail() {
  const rail = useGuildStore((s) => s.rail);
  const channels = useGuildStore((s) => s.channels);
  const reads = useReadStateStore((s) => s.byChannel);
  const view = useUiStore((s) => s.view);
  const navigate = useUiStore((s) => s.navigate);
  const dmMentions = useMemo(() => dmMentionTotal(channels, reads), [channels, reads]);
  const dmSettings = useNotificationSettingsStore((s) => s.byScope[DM_SCOPE]);
  const dms = useMemo(() => unreadDms(channels, reads, (c) => isChannelMuted(dmSettings, c.id, Date.now())), [channels, reads, dmSettings]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<RailTarget | null>(null);
  const homeActive = view.kind === 'home';
  const activeGuildId = view.kind === 'guild' ? view.guildId : null;

  return (
    <View accessibilityLabel="Servers" style={styles.rail}>
      <RailItem
        label="Direct messages"
        active={homeActive}
        unread={false}
        mentions={dms.length > 0 ? 0 : dmMentions}
        onPress={() => navigate({ kind: 'home', channelId: null })}
        tile={(active) => <Ionicons name={active ? 'home' : 'home-outline'} size={24} color={active ? theme.accentText : theme.muted} />}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {dms.map((dm) => (
          <UnreadDmItem key={dm.channel.id} dm={dm} />
        ))}
        <View style={styles.separator} />
        {rail.map((entry) =>
          entry.id === null ? (
            <GuildItem key={entry.guild_ids[0]} guildId={entry.guild_ids[0]!} active={activeGuildId === entry.guild_ids[0]} onEdit={setEditing} />
          ) : (
            <FolderItem key={`folder-${entry.id}`} folder={entry} activeGuildId={activeGuildId} onEdit={setEditing} />
          ),
        )}
        <RailItem label="Add a server" active={false} unread={false} mentions={0} onPress={() => setAdding(true)} tile={() => <Ionicons name="add" size={26} color={theme.success} />} />
      </ScrollView>
      <AddServerSheet visible={adding} onClose={() => setAdding(false)} />
      <RailMenu target={editing} onClose={() => setEditing(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { width: metrics.railWidth, backgroundColor: theme.background, alignItems: 'center', paddingTop: 6, paddingBottom: 12, gap: 8 },
  scroll: { alignItems: 'center', gap: 8, paddingTop: 5, paddingBottom: 8 },
  separator: { width: 32, height: 2, borderRadius: 2, backgroundColor: theme.hairlineStrong },
  item: { width: metrics.railWidth, alignItems: 'center', justifyContent: 'center' },
  pill: { position: 'absolute', left: 0, top: 6, width: 4, height: 36, borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: theme.text },
  pip: { position: 'absolute', left: 0, top: 20, width: 4, height: 8, borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: theme.text },
  tile: { width: metrics.serverTile, height: metrics.serverTile, borderRadius: metrics.serverRadius, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.raised, borderWidth: 1, borderColor: theme.hairline },
  tileActive: { borderRadius: metrics.serverRadiusActive, backgroundColor: theme.accent, borderColor: theme.accent },
  tilePressed: { transform: [{ scale: 0.94 }], backgroundColor: theme.raisedHover },
  badge: { position: 'absolute', right: 3, bottom: -6 },
  folderGrid: { width: '100%', height: '100%', flexDirection: 'row', flexWrap: 'wrap', padding: 6, gap: 2 },
  folderCell: { width: 16, height: 16, borderRadius: 5, backgroundColor: theme.raisedHover, alignItems: 'center', justifyContent: 'center' },
  folderInitial: { color: theme.muted, fontSize: 9, fontWeight: '700' },
});
