import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { GuildMeta } from '@discordy/core/application/stores/guildStore';
import { usePresenceStore } from '@discordy/core/application/stores/peopleStores';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import type { GuildMember } from '@discordy/core/contracts/rest';
import { voiceChannelOf } from '@discordy/core/domain/memberList';
import { theme } from '../theme';
import { activityText, memberName, roleColor } from './memberListModel';
import { StatusAvatar } from './StatusAvatar';

/** One person in the member list: avatar with status, name in their role colour, crown for the owner, bot tag, speaker when in voice, and their activity line. */
export function MemberRowView({ member, guild, onPress }: { member: GuildMember; guild: GuildMeta; onPress(): void }) {
  const presence = usePresenceStore((s) => s.byUser[member.user.id]);
  const inVoice = useVoiceStore((s) => voiceChannelOf(s.states[guild.id], member.user.id) !== null);
  const status = presence?.status ?? 'offline';
  const name = memberName(member);
  const activity = activityText(presence?.activities);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${status}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, status === 'offline' && styles.offline, pressed && styles.pressed]}
    >
      <StatusAvatar user={member.user} status={status} size={36} guildId={guild.id} member={member} />
      <View style={styles.copy}>
        <View style={styles.line}>
          <Text numberOfLines={1} style={[styles.name, { color: roleColor(guild.roles, member) ?? theme.text }]}>
            {name}
          </Text>
          {guild.owner_id === member.user.id && <Ionicons name="ribbon" size={13} color="#f0b232" accessibilityLabel="Server owner" />}
          {member.user.bot && <Text style={styles.bot}>APP</Text>}
        </View>
        {activity !== '' && (
          <Text numberOfLines={1} style={styles.activity}>
            {activity}
          </Text>
        )}
      </View>
      {inVoice && <Ionicons name="volume-high" size={15} color={theme.subtle} accessibilityLabel="In voice" />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16 },
  offline: { opacity: 0.55 },
  pressed: { backgroundColor: theme.hover },
  copy: { flex: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontSize: 16, fontWeight: '500' },
  bot: { color: theme.accentText, backgroundColor: theme.accent, fontSize: 9, fontWeight: '700', paddingHorizontal: 4, borderRadius: 3, overflow: 'hidden' },
  activity: { color: theme.subtle, fontSize: 13, marginTop: 1 },
});
