import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useDraftStore } from '@discordy/core/application/stores/composerStores';
import { AttachmentFlag, type Channel } from '@discordy/core/contracts/rest';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { channelAccess } from '../messages/messageAccess';
import { getRuntime } from '../runtime';
import { theme } from '../theme';
import { attempt } from '../ui/attempt';
import { Button, Field, Notice } from '../ui/controls';
import { Sheet } from '../ui/Sheet';
import { canPost, forumPosts, newPostBody, POST_TITLE_MAX } from './forumModel';

interface PendingPost { requestId: string; title: string; body: string; tags: string[] }
function readPending(key: string): PendingPost | null {
  try {
    const raw = useDraftStore.getState().drafts[key]?.text;
    const post = raw ? JSON.parse(raw) as PendingPost : null;
    return post && typeof post.requestId === 'string' && typeof post.title === 'string' && typeof post.body === 'string' && Array.isArray(post.tags) ? post : null;
  } catch { return null; }
}

function NewPostSheet({ guildId, forum, userId, visible, onClose }: { guildId: string; forum: Channel; userId: string; visible: boolean; onClose(): void }) {
  const draftKey = `forum-post-mobile:${userId}:${forum.id}`;
  const [pending, setPending] = useState<PendingPost | null>(() => readPending(draftKey));
  const [title, setTitle] = useState(() => readPending(draftKey)?.title ?? '');
  const [body, setBody] = useState(() => readPending(draftKey)?.body ?? '');
  const [tags, setTags] = useState<string[]>(() => readPending(draftKey)?.tags ?? []);
  const [busy, setBusy] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);
  const create = async () => {
    if (busy || forum.delivery_mode !== 'standard') return;
    setBusy(true);
    const request = pending ?? { requestId: globalThis.crypto.randomUUID(), title: title.trim(), body: body.trim(), tags };
    setPending(request);
    useDraftStore.getState().setDraft(draftKey, JSON.stringify(request), null);
    const thread = await attempt(() => getRuntime().api.createThread(forum.id, newPostBody(request.title, request.body, request.requestId, request.tags)), 'Could not create post');
    setBusy(false);
    if (thread?.forum_post_status === 'failed') setRequestFailed(true);
    if (thread?.forum_post_status !== 'published') return;
    useGuildStore.getState().upsertChannel({ ...thread, guild_id: thread.guild_id ?? guildId });
    useDraftStore.getState().clearDraft(draftKey);
    setPending(null);
    setTitle('');
    setBody('');
    setTags([]);
    onClose();
    router.push(`/servers/${guildId}/${thread.id}`);
  };
  return (
    <Sheet visible={visible} title="New post" closeLabel="Close new post" onClose={onClose}>
      <View style={styles.form}>
        {pending && <Notice>{requestFailed ? 'The opening message was deleted. You can start a new request with this text.' : 'Post status is pending or unknown. Check status using the same request.'}</Notice>}
        {forum.delivery_mode !== 'standard' && <Notice>New posts are not yet available in private delivery mode.</Notice>}
        <Field label="Title" value={title} editable={!pending} maxLength={POST_TITLE_MAX} autoCapitalize="sentences" onChangeText={setTitle} autoFocus />
        <Field label="Message" value={body} editable={!pending} multiline autoCapitalize="sentences" onChangeText={setBody} />
        {(forum.available_tags ?? []).map((tag) => <Pressable key={tag.id} accessibilityRole="checkbox" accessibilityLabel={tag.name} accessibilityState={{ checked: tags.includes(tag.id), disabled: !!pending }} disabled={!!pending} onPress={() => setTags(tags.includes(tag.id) ? tags.filter((id) => id !== tag.id) : tags.length < 5 ? [...tags, tag.id] : tags)}><Text style={styles.sub}>{tags.includes(tag.id) ? '[x] ' : '[ ] '}{tag.name}</Text></Pressable>)}
        {requestFailed ? <Button label="Start a new request" tone="primary" onPress={() => { useDraftStore.getState().clearDraft(draftKey); setPending(null); setRequestFailed(false); }} /> : <Button label={pending ? 'Check status' : 'Create post'} tone="primary" busy={busy} disabled={forum.delivery_mode !== 'standard' || !canPost(title, body) || (!!forum.require_tags && tags.length === 0)} onPress={() => void create()} />}
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
  useEffect(() => {
    let active = true;
    void attempt(() => getRuntime().api.listForumPosts(channelId), 'Could not load forum posts').then((posts) => {
      if (active && posts) posts.forEach((post) => useGuildStore.getState().upsertChannel({ ...post, forum_first_message: post.forum_first_message ?? null, message_count: post.message_count, last_message_id: post.last_message_id ?? null }));
    });
    return () => { active = false; };
  }, [channelId, channel?.delivery_mode]);
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
          const count = channel.delivery_mode === 'standard' ? item.message_count : undefined;
          const archived = item.thread_metadata?.archived === true;
          const cover = channel.delivery_mode === 'standard' ? item.forum_first_message?.attachments?.find((attachment) => attachment.content_type?.startsWith('image/') && !((attachment.flags ?? 0) & AttachmentFlag.IS_SPOILER)) : undefined;
          return (
            <Pressable accessibilityRole="button" accessibilityLabel={`Open post ${item.name ?? 'post'}${archived ? ', archived' : ''}`} onPress={() => router.push(`/servers/${guildId}/${item.id}`)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <Ionicons name="chatbubbles-outline" size={22} color={archived ? theme.subtle : theme.text} />
              <View style={styles.copy}>
                <Text numberOfLines={2} style={[styles.name, archived && styles.archived]}>
                  {item.name ?? 'post'}
                </Text>
                {channel.delivery_mode === 'standard' && item.forum_first_message?.content && <Text numberOfLines={2} style={styles.sub}>{item.forum_first_message.content}</Text>}
                <Text style={styles.sub}>{`${count == null ? 'Post' : `${Math.max(0, count - 1)} replies`}${archived ? ' - Archived' : ''}`}</Text>
              </View>
              {cover && <Image source={{ uri: cover.proxy_url ?? cover.url }} accessibilityLabel={cover.description ?? 'Post cover'} style={styles.cover} />}
              <Ionicons name="chevron-forward" size={16} color={theme.subtle} />
            </Pressable>
          );
        }}
      />
      <NewPostSheet key={`${me}:${channelId}`} guildId={guildId} forum={channel} userId={me} visible={creating} onClose={() => setCreating(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  topic: { color: theme.muted, fontSize: 14, padding: 16, paddingBottom: 4 },
  form: { paddingHorizontal: 20, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingHorizontal: 16, paddingVertical: 8 },
  pressed: { backgroundColor: theme.hover },
  cover: { width: 64, height: 64, borderRadius: 8 },
  copy: { flex: 1 },
  name: { color: theme.text, fontSize: 16, fontWeight: '600' },
  archived: { color: theme.subtle },
  sub: { color: theme.subtle, fontSize: 13, marginTop: 2 },
});
