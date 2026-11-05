import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useInteractionStore } from '@discordy/core/application/stores/interactionStore';
import { Avatar } from '../profile/Avatar';
import { AVATAR_SIZE } from '../messages/MessageRow';
import { theme } from '../theme';

/** "App is thinking..." for each command run in this chat that has no answer yet, at the newest end of the list. Unanswered ones are dropped after fifteen minutes. */
export function ThinkingRows({ channelId }: { channelId: string }) {
  const pending = useInteractionStore((s) => s.pending[channelId]);
  useEffect(() => {
    if (!pending?.length) return;
    const timer = setInterval(() => useInteractionStore.getState().expirePending(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [pending?.length]);
  if (!pending?.length) return null;
  return (
    <View>
      {pending.map((p) => (
        <View key={p.id} style={styles.row} accessibilityLabel={`${p.appName} is thinking`}>
          <Avatar user={{ id: p.applicationId, avatar: null, username: p.appName, global_name: null }} size={AVATAR_SIZE} />
          <View style={styles.body}>
            <Text style={styles.name}>{p.appName}</Text>
            <Text style={styles.text}>{`${p.appName} is thinking...`}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingVertical: 6 },
  body: { flex: 1 },
  name: { color: theme.text, fontSize: 15, fontWeight: '600' },
  text: { color: theme.subtle, fontSize: 14, fontStyle: 'italic' },
});
