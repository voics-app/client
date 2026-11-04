import { Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { theme } from '../theme';

/** A channel this version cannot open (ephemeral, peer-to-peer, forum): its name and one plain sentence saying so. */
export function UnsupportedChannelScreen({ channelId, message }: { channelId: string; message: string }) {
  const name = useGuildStore((s) => s.channels[channelId]?.name ?? '');
  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: name }} />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', padding: 32 },
  message: { color: theme.muted, fontSize: 16, textAlign: 'center' },
});
