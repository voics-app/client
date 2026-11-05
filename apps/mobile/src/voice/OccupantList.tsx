import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useVoiceStore, usersInChannel } from '@discordy/core/application/stores/voiceStore';
import type { Channel } from '@discordy/core/contracts/rest';
import { Avatar } from '../profile/Avatar';
import { theme } from '../theme';
import { occupantView } from './occupantModel';

/** The people connected to a voice channel, from voice state: avatar, name and mute, deafen, camera and live flags. `compact` is the indented list under a channel row. */
export function OccupantList({ channel, compact = false }: { channel: Channel; compact?: boolean }) {
  const states = useVoiceStore((s) => s.states);
  const members = useGuildStore((s) => (channel.guild_id ? s.members[channel.guild_id] : undefined));
  const occupants = usersInChannel(states, channel.guild_id, channel.id).map((state) => occupantView(state, members?.[state.user_id]));
  if (occupants.length === 0) return null;
  const size = compact ? 22 : 36;
  return (
    <View testID={`occupants-${channel.id}`} style={compact ? styles.compact : styles.full}>
      {occupants.map((o) => (
        <View key={o.userId} accessibilityLabel={[o.name, ...o.flags].join(', ')} accessible style={[styles.row, compact && styles.rowCompact]}>
          <Avatar user={o.user} size={size} />
          <Text numberOfLines={1} style={[styles.name, compact && styles.nameCompact]}>
            {o.name}
          </Text>
          {o.marks.camera && <Ionicons name="videocam" size={14} color={theme.subtle} />}
          {o.marks.mute && <Ionicons name="mic-off" size={14} color={theme.danger} />}
          {o.marks.deaf && <Ionicons name="volume-mute" size={14} color={theme.danger} />}
          {o.marks.live && <Text style={styles.live}>LIVE</Text>}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  compact: { paddingLeft: 26, paddingBottom: 4 },
  full: { paddingHorizontal: 16, paddingTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  rowCompact: { gap: 8, paddingVertical: 2 },
  name: { flex: 1, color: theme.text, fontSize: 16 },
  nameCompact: { color: theme.subtle, fontSize: 14 },
  live: { color: theme.danger, fontSize: 10, fontWeight: '700' },
});
