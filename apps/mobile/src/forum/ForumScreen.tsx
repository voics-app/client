import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { channelAccess } from '../messages/messageAccess';
import { getRuntime } from '../runtime';
import { theme } from '../theme';
import { attempt } from '../ui/attempt';
import { Button, Field, Notice } from '../ui/controls';
import { Sheet } from '../ui/Sheet';
import { canPost, forumPosts, newPostBody, POST_TITLE_MAX } from './forumModel';

function NewPostSheet({ guildId, forumId, visible, onClose }: { guildId: string; forumId: string; visible: boolean; onClose(): void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    const thread = await attempt(() => getRuntime().api.createThread(forumId, newPostBody(title, body)), 'Could not create post');
    setBusy(false);
    if (!thread) return;
    useGuildStore.getState().upsertChannel({ ...thread, guild_id: thread.guild_id ?? guildId });
    setTitle('');
    setBody('');
    onClose();
    router.push(`/servers/${guildId}/${thread.id}`);
  };
  return (
    <Sheet visible={visible} title="New post" closeLabel="Close new post" onClose={onClose}>
      <View style={styles.form}>
        <Field label="Title" value={title} maxLength={POST_TITLE_MAX} autoCapitalize="sentences" onChangeText={setTitle} autoFocus />
        <Field label="Message" value={body} multiline autoCapitalize="sentences" onChangeText={setBody} />
        <Button label="Create post" tone="primary" busy={busy} disabled={!canPost(title, body)} onPress={() => void create()} />
      </View>
    </Sheet>
  );
}

/** A forum channel: its posts (each a public thread, newest first) and, with the permission to start threads, New post. Opening a post shows it as a chat. */
export function ForumScreen({ guildId, channelId }: { guildId: string; channelId: string }) {
  const channels = useGuildStore((s) => s.channels);
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const members = useGuildStore((s) => s.members[guildId]);
  const me = useSessionStore((s) => s.user?.id);
  const [creating, setCreating] = useState(false);
  const channel = channels[channelId];
  const posts = useMemo(() => forumPosts(channels, channelId), [channels, channelId]);
  if (!channel || !guild || !me) return <Notice>This channel is not available.</Notice>;
  // Starting a post is starting a public thread in the forum: needs Create Public Threads and View Channel, from the same algorithm as desktop.
  const canCreate = channelAccess({ guild, channel, members, userId: me }).canCreateThread;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: channel.name ?? 'Forum', headerRight: canCreate ? () => <Button label="New post" onPress={() => setCreating(true)} /> : () => null }} />
      {channel.topic ? <Text style={styles.topic}>{channel.topic}</Text> : null}
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        ListEmptyComponent={<Notice>{canCreate ? 'No posts yet. Start a discussion: every post is its own thread.' : 'No posts yet.'}</Notice>}
        renderItem={({ item }) => {
          const count = item.message_count ?? 0;
          const archived = item.thread_metadata?.archived === true;
          return (
            <Pressable accessibilityRole="button" accessibilityLabel={`Open post ${item.name ?? 'post'}${archived ? ', archived' : ''}`} onPress={() => router.push(`/servers/${guildId}/${item.id}`)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <Ionicons name="chatbubbles-outline" size={22} color={archived ? theme.subtle : theme.text} />
              <View style={styles.copy}>
                <Text numberOfLines={2} style={[styles.name, archived && styles.archived]}>
                  {item.name ?? 'post'}
                </Text>
                <Text style={styles.sub}>{`${count} ${count === 1 ? 'message' : 'messages'}${archived ? ' - Archived' : ''}`}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.subtle} />
            </Pressable>
          );
        }}
      />
      <NewPostSheet guildId={guildId} forumId={channelId} visible={creating} onClose={() => setCreating(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  topic: { color: theme.muted, fontSize: 14, padding: 16, paddingBottom: 4 },
  form: { paddingHorizontal: 20, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingHorizontal: 16, paddingVertical: 8 },
  pressed: { backgroundColor: theme.hover },
  copy: { flex: 1 },
  name: { color: theme.text, fontSize: 16, fontWeight: '600' },
  archived: { color: theme.subtle },
  sub: { color: theme.subtle, fontSize: 13, marginTop: 2 },
});
