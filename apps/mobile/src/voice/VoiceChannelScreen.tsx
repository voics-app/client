import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useVoiceStore, usersInChannel } from '@discordy/core/application/stores/voiceStore';
import { theme } from '../theme';
import { Notice } from '../ui/controls';
import { OccupantList } from './OccupantList';
import { openCallScreen, voiceAvailable } from './voiceActions';

export const VOICE_UNAVAILABLE = "Voice isn't in this test version yet";

/** A voice or stage channel: its name, who is connected right now, and a plain note that joining is not available yet (Expo Go) or the Join button (development build). */
export function VoiceChannelScreen({ channelId }: { channelId: string }) {
  const channel = useGuildStore((s) => s.channels[channelId]);
  const count = useVoiceStore((s) => (channel ? usersInChannel(s.states, channel.guild_id, channel.id).length : 0));
  if (!channel) return <Notice>This channel is not available.</Notice>;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: channel.name ?? 'Voice channel' }} />
      <View style={styles.hero}>
        <Ionicons name="volume-high" size={40} color={theme.subtle} />
        <Text style={styles.name}>{channel.name}</Text>
        {voiceAvailable() ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Join voice" onPress={() => openCallScreen(channel.id)} style={styles.join}>
            <Text style={styles.joinText}>Join voice</Text>
          </Pressable>
        ) : (
          <Text style={styles.notice}>{VOICE_UNAVAILABLE}</Text>
        )}
        {channel.delivery_mode === 'standard' && channel.guild_id && (
          <Pressable accessibilityRole="button" accessibilityLabel="Open text chat" onPress={() => router.push({ pathname: '/servers/[guildId]/[channelId]', params: { guildId: channel.guild_id!, channelId: channel.id, chat: '1' } })} style={styles.chat}>
            <Ionicons name="chatbubble-outline" size={18} color={theme.text} />
            <Text style={styles.chatText}>Open text chat</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.heading}>{count === 0 ? 'Nobody is here right now' : `In this channel, ${count}`}</Text>
      <OccupantList channel={channel} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  content: { paddingBottom: 32 },
  hero: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24, gap: 10 },
  name: { color: theme.text, fontSize: 22, fontWeight: '700' },
  notice: { color: theme.muted, fontSize: 15, textAlign: 'center' },
  join: { marginTop: 6, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: theme.accent },
  chat: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 20, borderRadius: 12, backgroundColor: theme.raised },
  chatText: { color: theme.text, fontSize: 15, fontWeight: '600' },
  joinText: { color: theme.accentText, fontSize: 15, fontWeight: '700' },
  heading: { color: theme.subtle, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.66, paddingHorizontal: 16 },
});
