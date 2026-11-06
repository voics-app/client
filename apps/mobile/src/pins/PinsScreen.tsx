import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '@discordy/core/application/errorMessage';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import { useReadNavStore } from '@discordy/core/application/stores/readNavStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { ChatContext, chatContextFor } from '../messages/chatContext';
import { channelAccess, dmAccess } from '../messages/messageAccess';
import { MessageSummary } from '../messages/MessageSummary';
import { getRuntime } from '../runtime';
import { theme } from '../theme';
import { attempt, confirmDestructive } from '../ui/attempt';
import { Notice } from '../ui/controls';
import { RowSkeletons } from '../ui/Skeleton';
import { mayUnpin } from './pinsModel';

/** Desktop's Pins panel: the channel's pinned messages with Jump (back to the chat, scrolled to the message) and Unpin for those who may. */
export function PinsScreen({ channelId }: { channelId: string }) {
  const channel = useGuildStore((s) => s.channels[channelId]);
  const guildId = channel?.guild_id ?? undefined;
  const guild = useGuildStore((s) => (guildId ? s.guilds[guildId] : undefined));
  const members = useGuildStore((s) => (guildId ? s.members[guildId] : undefined));
  const userId = useSessionStore((s) => s.user?.id);
  const [pins, setPins] = useState<ChatMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pinStamp = channel?.last_pin_timestamp ?? null;

  const load = useCallback(() => {
    setError(null);
    getRuntime()
      .api.pins(channelId)
      .then((list) => setPins(list as ChatMessage[]))
      .catch((e: unknown) => setError(errorMessage(e)));
  }, [channelId]);
  // Reload when someone pins or unpins while the page is open (CHANNEL_PINS_UPDATE changes the stamp).
  useEffect(load, [load, pinStamp]);

  const access = useMemo(() => {
    if (!channel || !userId) return null;
    if (!guildId) return dmAccess(channel);
    return guild ? channelAccess({ guild, channel, members, userId }) : null;
  }, [channel, guildId, guild, members, userId]);
  const canUnpin = channel && access ? mayUnpin(channel, access) : false;
  const context = useMemo(() => chatContextFor(guildId), [guildId]);

  const jump = (messageId: string) => {
    useReadNavStore.getState().requestJump(channelId, messageId);
    router.back();
  };
  const unpin = (messageId: string) =>
    confirmDestructive('Unpin this message?', 'It stays in the channel.', 'Unpin', () => {
      void attempt(async () => {
        await getRuntime().api.unpin(channelId, messageId);
        setPins((current) => current?.filter((m) => m.id !== messageId) ?? current);
      }, 'Could not unpin the message');
    });

  if (!channel) return <Notice>This channel is not available.</Notice>;
  return (
    <ChatContext.Provider value={context}>
      <View style={styles.screen}>
        {error && !pins ? (
          <Pressable accessibilityRole="button" onPress={load} style={styles.retry}>
            <Text style={styles.retryText}>{`${error} Try again`}</Text>
          </Pressable>
        ) : pins === null ? (
          <RowSkeletons avatar={false} />
        ) : (
          <FlatList
            data={pins}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.content}
            ListEmptyComponent={<Notice>No pinned messages. Pin important messages so they are easy to find.</Notice>}
            renderItem={({ item }) => (
              <MessageSummary message={item}>
                <View style={styles.actions}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Jump to message from ${item.author.global_name || item.author.username}`} onPress={() => jump(item.id)} style={styles.action}>
                    <Ionicons name="arrow-redo-outline" size={18} color={theme.accent} />
                    <Text style={styles.actionText}>Jump</Text>
                  </Pressable>
                  {canUnpin && (
                    <Pressable accessibilityRole="button" accessibilityLabel={`Unpin message from ${item.author.global_name || item.author.username}`} onPress={() => unpin(item.id)} style={styles.action}>
                      <Ionicons name="pin-outline" size={18} color={theme.muted} />
                      <Text style={[styles.actionText, styles.muted]}>Unpin</Text>
                    </Pressable>
                  )}
                </View>
              </MessageSummary>
            )}
          />
        )}
      </View>
    </ChatContext.Provider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  content: { paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  retry: { minHeight: 44, padding: 32, alignItems: 'center' },
  retryText: { color: theme.accent, fontSize: 15, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingRight: 16 },
  actionText: { color: theme.accent, fontSize: 15, fontWeight: '600' },
  muted: { color: theme.muted },
});
