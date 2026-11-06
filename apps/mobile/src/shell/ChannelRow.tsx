import { Ionicons } from '@expo/vector-icons';
import { openChat } from '../navigation/openChat';
import { StyleSheet, Text, View } from 'react-native';
import { useNotificationSettingsStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { useReadStateStore } from '@discordy/core/application/stores/peopleStores';
import { useVoiceStore, usersInChannel } from '@discordy/core/application/stores/voiceStore';
import type { Channel } from '@discordy/core/contracts/rest';
import { scopeKey } from '@discordy/core/domain/notificationSettings';
import { channelRowView } from '../servers/channelRowModel';
import { CHROME_FONT_CAP, metrics, radius, theme, type } from '../theme';
import { PressableScale } from '../ui/PressableScale';
import { OccupantList } from '../voice/OccupantList';
import { Badge } from './Badge';
import { channelFlags } from './railModel';

/** One channel in the column: `#`, speaker, megaphone or forum icon, name, lock and capacity marks, mention badge, and for voice channels the people inside. */
export function ChannelRow({ channel, guildId, active, canMoveMembers, onMenu }: { channel: Channel; guildId: string; active: boolean; canMoveMembers: boolean; onMenu?: (channel: Channel) => void }) {
  const read = useReadStateStore((s) => s.byChannel[channel.id]);
  const settings = useNotificationSettingsStore((s) => s.byScope[scopeKey(guildId)]);
  const occupants = useVoiceStore((s) => usersInChannel(s.states, channel.guild_id, channel.id).length);
  const view = channelRowView(channel, occupants, canMoveMembers);
  const flags = channelFlags(channel, read, settings, Date.now());
  const unread = flags.unread && !view.voice;
  const on = active || unread;
  const tint = on ? theme.text : theme.subtle;
  return (
    <View>
      <PressableScale
        scale={false}
        accessibilityRole="button"
        accessibilityLabel={view.label}
        accessibilityState={{ selected: active }}
        onPress={() => openChat({ guildId, channelId: channel.id })}
        {...(onMenu ? { onLongPress: () => onMenu(channel), delayLongPress: 350 } : {})}
        style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && !active && styles.rowPressed, flags.muted && styles.muted]}
      >
        {unread && <View testID="channel-unread" style={styles.unreadDot} />}
        {view.glyph ? <Ionicons name={view.glyph} size={18} color={tint} /> : <Text style={[styles.hash, on && styles.nameOn]}>#</Text>}
        <Text numberOfLines={1} maxFontSizeMultiplier={CHROME_FONT_CAP} style={[styles.name, on && styles.nameOn, unread && styles.nameUnread]}>
          {channel.name}
        </Text>
        {view.private && <Ionicons name="lock-closed" size={12} color={theme.subtle} accessibilityLabel="Private channel" />}
        {view.nsfw && <Text style={styles.nsfw}>18+</Text>}
        {view.ephemeral && <Ionicons name="lock-closed" size={13} color={theme.accent} accessibilityLabel="Ephemeral, end-to-end encrypted" />}
        {view.p2p && <Ionicons name="link" size={13} color={theme.accent} accessibilityLabel="Peer-to-peer" />}
        {view.capacity && <Text style={[styles.capacity, view.capacity.full && styles.full]}>{view.capacity.label}</Text>}
        <Badge value={flags.mentions} />
      </PressableScale>
      {view.voice && <OccupantList channel={channel} compact />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, height: metrics.channelRowHeight, marginVertical: 1, paddingHorizontal: 10, borderRadius: radius.control },
  rowPressed: { backgroundColor: theme.hover },
  rowActive: { backgroundColor: theme.accentSoft },
  muted: { opacity: 0.55 },
  unreadDot: { position: 'absolute', left: -8, top: 18, width: 4, height: 8, borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: theme.text },
  hash: { color: theme.subtle, fontSize: 20, width: 18, textAlign: 'center' },
  name: { flex: 1, color: theme.subtle, fontSize: type.title },
  nameOn: { color: theme.text },
  nameUnread: { fontWeight: '600' },
  nsfw: { color: theme.danger, fontSize: 10, fontWeight: '700' },
  capacity: { color: theme.subtle, fontSize: 11 },
  full: { color: theme.danger },
});
