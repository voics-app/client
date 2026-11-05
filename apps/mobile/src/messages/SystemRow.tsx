import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import { formatMessageTime } from '@discordy/core/domain/messageTime';
import { systemSpec, type SystemIcon, type SystemPart, type SystemTone } from '@discordy/core/domain/systemMessage';
import { theme } from '../theme';
import { useChatContext } from './chatContext';

const ICONS: Record<SystemIcon, keyof typeof Ionicons.glyphMap> = {
  arrowIn: 'log-in-outline',
  arrowOut: 'log-out-outline',
  phone: 'call',
  phoneEnded: 'call-outline',
  pencil: 'pencil',
  image: 'image-outline',
  pin: 'pin',
  wave: 'hand-right',
  thread: 'chatbubbles-outline',
  warning: 'warning-outline',
};
const TONES: Record<SystemTone, string> = { positive: theme.success, negative: theme.danger, neutral: theme.muted };

/** A server-generated message (join, pin, call, group changes) as one line with its icon, from `domain/systemMessage`. */
export function SystemRow({ message, authorName, targetName }: { message: ChatMessage; authorName: string; targetName: string | null }) {
  const { onJumpToMessage, onWave, onOpenPins } = useChatContext();
  const spec = systemSpec({
    type: message.type,
    messageId: message.id,
    authorName,
    targetName,
    content: message.content ?? '',
    timestamp: message.timestamp,
    call: message.call,
    threadName: message.thread?.name ?? null,
    hasReference: Boolean(message.message_reference?.message_id),
  });
  const reference = message.message_reference?.message_id;
  const part = (p: SystemPart, i: number) => {
    if (p.t === 'name') {
      return (
        <Text key={i} style={styles.name}>
          {p.text}
        </Text>
      );
    }
    if (p.t === 'link' && p.action === 'jump' && reference) {
      return (
        <Text key={i} accessibilityRole="link" style={styles.link} onPress={() => onJumpToMessage(reference)}>
          {p.text}
        </Text>
      );
    }
    if (p.t === 'link' && p.action === 'pins') {
      return (
        <Text key={i} accessibilityRole="link" style={styles.link} onPress={onOpenPins}>
          {p.text}
        </Text>
      );
    }
    return <Text key={i}>{p.text}</Text>;
  };
  return (
    <View style={styles.row}>
      <Ionicons name={ICONS[spec.icon]} size={18} color={TONES[spec.tone]} style={styles.icon} />
      <View style={styles.body}>
        <Text style={styles.text}>
          {spec.parts.map(part)}
          <Text style={styles.time}>{`  ${formatMessageTime(message.timestamp, Date.now())}`}</Text>
        </Text>
        {spec.wave && (
          <Pressable accessibilityRole="button" onPress={() => onWave(message.id)} style={styles.wave}>
            <Text style={styles.waveText}>Wave to say hi</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 6, marginTop: 8 },
  icon: { width: 40, textAlign: 'center', paddingTop: 2 },
  body: { flex: 1 },
  text: { color: theme.muted, fontSize: 15, lineHeight: 21 },
  name: { color: theme.text, fontWeight: '700' },
  link: { color: theme.accent },
  time: { color: theme.subtle, fontSize: 11 },
  wave: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, marginTop: 4, borderRadius: 10, backgroundColor: theme.raised },
  waveText: { color: theme.text, fontSize: 14, fontWeight: '600' },
});
