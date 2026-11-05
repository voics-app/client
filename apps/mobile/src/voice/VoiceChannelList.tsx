import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { theme, metrics } from '../theme';
import { openCallScreen, VOICE_UNAVAILABLE, voiceAvailable } from './voiceActions';
import { voiceChannelRows, type VoiceChannelRow } from './voiceModel';

function Row({ row }: { row: VoiceChannelRow }) {
  const connected = useVoiceStore((s) => s.call.channelId === row.channel.id && s.call.status !== 'idle');
  const blocked = row.capacity.joinBlocked;
  const open = () => {
    if (!voiceAvailable()) Alert.alert('Voice', VOICE_UNAVAILABLE);
    else if (!blocked) openCallScreen(row.channel.id);
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Join voice channel ${row.channel.name}`}
      accessibilityState={{ selected: connected, disabled: blocked }}
      onPress={open}
      style={[styles.row, connected && styles.rowActive, blocked && styles.blocked]}
    >
      <Ionicons name="volume-high-outline" size={18} color={connected ? theme.text : theme.subtle} />
      <Text numberOfLines={1} style={[styles.name, connected && styles.nameOn]}>
        {row.channel.name}
      </Text>
      {row.occupants > 0 && <Text style={styles.count}>{row.capacity.label ?? row.occupants}</Text>}
    </Pressable>
  );
}

/** The server's voice channels, under its text channels: tap one to join. Joining needs the development build; Expo Go says so. */
export function VoiceChannelList({ guildId }: { guildId: string }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const channels = useGuildStore((s) => s.channels);
  const members = useGuildStore((s) => s.members[guildId]);
  const states = useVoiceStore((s) => s.states[guildId]);
  const userId = useSessionStore((s) => s.user?.id);
  const rows = useMemo(() => (guild && userId ? voiceChannelRows({ guild, channels, members, userId, states }) : []), [guild, channels, members, userId, states]);
  if (rows.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>VOICE CHANNELS</Text>
      {rows.map((row) => (
        <Row key={row.channel.id} row={row} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 8, paddingBottom: 16 },
  heading: { color: theme.subtle, fontSize: 11, fontWeight: '600', letterSpacing: 0.66, marginTop: 14, marginBottom: 2, paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, height: metrics.channelRowHeight, marginVertical: 1, paddingHorizontal: 8, borderRadius: 8 },
  rowActive: { backgroundColor: theme.accentSoft },
  blocked: { opacity: 0.5 },
  name: { flex: 1, color: theme.subtle, fontSize: 15 },
  nameOn: { color: theme.text },
  count: { color: theme.subtle, fontSize: 12 },
});
