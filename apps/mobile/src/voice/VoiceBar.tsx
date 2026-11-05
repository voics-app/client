import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { metrics, theme } from '../theme';
import { leaveVoice, openCallScreen, toggleMute } from './voiceActions';
import { callHeadline } from './voiceModel';
import { useCallInfo } from './useCallInfo';

function Bar({ channelId }: { channelId: string }) {
  const call = useVoiceStore((s) => s.call);
  const selfMute = useVoiceStore((s) => s.selfMute);
  const { title } = useCallInfo(channelId);
  return (
    <View style={styles.bar}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open call, ${title}`} onPress={() => openCallScreen(channelId)} style={styles.open}>
        <Ionicons name="volume-high" size={18} color={call.status === 'connected' ? theme.success : theme.muted} />
        <View style={styles.copy}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          <Text numberOfLines={1} style={styles.sub}>
            {callHeadline(call)}
          </Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={selfMute ? 'Unmute' : 'Mute'} hitSlop={6} onPress={toggleMute} style={styles.icon}>
        <Ionicons name={selfMute ? 'mic-off' : 'mic'} size={22} color={selfMute ? theme.danger : theme.text} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Leave voice" hitSlop={6} onPress={() => void leaveVoice()} style={styles.icon}>
        <Ionicons name="call" size={22} color={theme.danger} style={styles.hangup} />
      </Pressable>
    </View>
  );
}

/** Shown above the user panel while you are in a call: the channel, its state, mute and leave. Tapping it returns to the call screen. */
export function VoiceBar() {
  const channelId = useVoiceStore((s) => (s.call.status === 'idle' || s.call.status === 'failed' ? null : s.call.channelId));
  return channelId ? <Bar channelId={channelId} /> : null;
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 8, marginBottom: 6, padding: 6, borderRadius: metrics.panelRadius, backgroundColor: theme.raised, borderWidth: 1, borderColor: theme.hairline },
  open: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0, padding: 4 },
  copy: { flex: 1, minWidth: 0 },
  title: { color: theme.text, fontSize: 13, fontWeight: '600' },
  sub: { color: theme.subtle, fontSize: 11 },
  icon: { padding: 8 },
  hangup: { transform: [{ rotate: '135deg' }] },
});
