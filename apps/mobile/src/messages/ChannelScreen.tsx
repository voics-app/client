import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Pressable, StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '@discordy/core/application/errorMessage';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useMessageStore, type ChatMessage } from '@discordy/core/application/stores/messageStore';
import { useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { User } from '@discordy/core/contracts/rest';
import { headerButtons } from '@discordy/core/domain/chatHeader';
import { groupMessages } from '@discordy/core/domain/messageGrouping';
import { ChatHeaderActions, ChatHeaderTitle } from './ChatHeader';
import { composerPlaceholder } from './composerPlaceholder';
import { Composer, type ComposerMode } from './Composer';
import { MessageActionSheet } from './MessageActionSheet';
import { MessageRow, nameOf } from './MessageRow';
import { SelectTextSheet } from './SelectTextSheet';
import { dmTitle } from '../dms/dmModel';
import { ProfileSheet } from '../profile/ProfileSheet';
import { channelAccess, dmAccess, messageActions } from './messageAccess';
import { useKeyboardVisible } from './useKeyboardVisible';
import { useAppActive } from './useAppActive';
import { useMessageService } from './useMessageService';
import { theme } from '../theme';

const COMPOSE: ComposerMode = { kind: 'compose' };
const PRIVATE_NOTICE = 'This channel uses private delivery, which the mobile app does not support yet.';
const PRIVATE_HISTORY_NOTICE = 'Messages in this channel stay on devices, so there is no server history to show.';
const NO_SEND_NOTICE = 'You do not have permission to send messages in this channel.';
const NO_HISTORY_NOTICE = 'You do not have permission to read the history of this channel.';

/** A server text channel, or a direct or group conversation when there is no `guildId`. */
export function ChannelScreen({ guildId, channelId }: { guildId?: string; channelId: string }) {
  const service = useMessageService();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const keyboardVisible = useKeyboardVisible();
  const guild = useGuildStore((s) => (guildId ? s.guilds[guildId] : undefined));
  const channel = useGuildStore((s) => s.channels[channelId]);
  const members = useGuildStore((s) => (guildId ? s.members[guildId] : undefined));
  const relationships = useRelationshipStore((s) => s.byUser);
  const userId = useSessionStore((s) => s.user?.id);
  const timeline = useMessageStore((s) => s.timelines[channelId]);

  const [mode, setMode] = useState<ComposerMode>(COMPOSE);
  const [selected, setSelected] = useState<ChatMessage | null>(null);
  const [selecting, setSelecting] = useState<ChatMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [profileUser, setProfileUser] = useState<User | null>(null);

  const access = useMemo(() => {
    if (!channel || !userId) return null;
    if (!guildId) return channel.guild_id ? null : dmAccess(channel);
    return guild ? channelAccess({ guild, channel, members, userId }) : null;
  }, [guildId, guild, channel, members, userId]);
  const peer = !guildId && channel && headerButtons(channel).profile ? channel.recipients![0]! : null;
  const title = !channel ? '' : guildId ? `#${channel.name}` : dmTitle(channel, relationships);
  const readable = access !== null && access.standard && access.canReadHistory;
  const loaded = timeline?.loaded ?? false;

  const loadLatest = useCallback(() => {
    setLoadFailed(false);
    service.loadLatest(channelId).catch((e: unknown) => {
      setLoadFailed(true);
      setError(errorMessage(e));
    });
  }, [service, channelId]);

  useEffect(() => {
    if (readable && !loaded) loadLatest();
    // Only the first open of a channel loads the latest page; later updates arrive from the gateway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readable, channelId]);

  const rows = useMemo(() => {
    if (!timeline) return [];
    const ordered = timeline.ids.flatMap((id) => timeline.byId[id] ?? []);
    const grouped = groupMessages(ordered.map((message) => ({ id: message.id, authorId: message.author.id, timestamp: Date.parse(message.timestamp), breaksGroup: message.type === 19, message })));
    return grouped.map((g) => ({ message: g.message.message, showHeader: g.startsGroup })).reverse();
  }, [timeline]);

  const latestId = useMemo(() => {
    const ids = timeline?.ids ?? [];
    return ids.findLast((id) => !timeline?.byId[id]?.localState) ?? null;
  }, [timeline]);
  const appActive = useAppActive();
  useEffect(() => {
    if (appActive && readable && loaded && latestId) service.markRead(channelId, latestId);
  }, [appActive, service, channelId, readable, loaded, latestId]);

  const fail = useCallback((e: unknown) => setError(errorMessage(e)), []);

  const submit = useCallback(
    (text: string, current: ComposerMode) => {
      if (!channel) return;
      setMode(COMPOSE);
      setError(null);
      if (current.kind === 'edit') service.edit(channelId, current.messageId, text).catch(fail);
      else void service.send(channel, { content: text, ...(current.kind === 'reply' ? { replyTo: current.messageId } : {}) });
    },
    [service, channel, channelId, fail],
  );

  const toggleReaction = useCallback(
    (message: ChatMessage, emoji: string) => {
      setError(null);
      service.toggleReaction(channelId, message.id, emoji).catch(fail);
    },
    [service, channelId, fail],
  );

  const confirmDelete = (message: ChatMessage) =>
    Alert.alert('Delete message?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void service.remove(channelId, message.id).catch(fail) },
    ]);

  const blockedReason = !access ? null : !access.standard ? PRIVATE_NOTICE : !access.canSend ? NO_SEND_NOTICE : null;
  const actions = selected && access && userId ? messageActions(selected, access, userId) : null;
  const close = () => setSelected(null);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding" keyboardVerticalOffset={headerHeight}>
      <Stack.Screen
        options={{
          headerTitle: () => <ChatHeaderTitle title={title} peer={peer} />,
          headerRight: () => <ChatHeaderActions calls={!guildId} onProfile={peer ? () => setProfileUser(peer) : undefined} />,
        }}
      />
      {error && (
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss error" onPress={() => setError(null)} style={styles.error}>
          <Text style={styles.errorText}>{error}</Text>
        </Pressable>
      )}
      {!access ? (
        <Text style={styles.notice}>This channel is not available.</Text>
      ) : !readable ? (
        <Text style={styles.notice}>{!access.standard ? PRIVATE_HISTORY_NOTICE : NO_HISTORY_NOTICE}</Text>
      ) : !loaded ? (
        <View style={styles.center}>
          {loadFailed ? (
            <Pressable accessibilityRole="button" onPress={loadLatest}>
              <Text style={styles.retry}>Try again</Text>
            </Pressable>
          ) : (
            <ActivityIndicator color={theme.muted} />
          )}
        </View>
      ) : (
        <FlatList
          testID="message-list"
          style={styles.list}
          inverted
          contentContainerStyle={styles.listContent}
          data={rows}
          keyExtractor={(row) => row.message.id}
          onEndReached={() => void service.loadOlder(channelId).catch(fail)}
          onEndReachedThreshold={0.5}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.notice}>No messages yet. Say hello.</Text>}
          renderItem={({ item }) => (
            <MessageRow
              message={item.message}
              showHeader={item.showHeader}
              replied={item.message.message_reference?.message_id ? timeline?.byId[item.message.message_reference.message_id] : undefined}
              onLongPress={setSelected}
              onToggleReaction={toggleReaction}
              onPressAuthor={setProfileUser}
              onRetry={(m) => channel && void service.retry(channel, m.id)}
              onDiscard={(m) => service.discard(channelId, m.id)}
            />
          )}
        />
      )}
      <View style={[styles.dock, { paddingBottom: keyboardVisible ? 0 : insets.bottom }]}>
        <Composer mode={mode} blockedReason={blockedReason} placeholder={composerPlaceholder(channel, relationships)} onSubmit={submit} onCancelMode={() => setMode(COMPOSE)} />
      </View>
      <ProfileSheet user={profileUser} onClose={() => setProfileUser(null)} />
      <MessageActionSheet
        actions={actions}
        onClose={close}
        onReact={(emoji) => {
          if (selected) toggleReaction(selected, emoji);
          close();
        }}
        onReply={() => {
          if (selected) setMode({ kind: 'reply', messageId: selected.id, authorName: nameOf(selected.author) });
          close();
        }}
        onEdit={() => {
          if (selected) setMode({ kind: 'edit', messageId: selected.id, content: selected.content });
          close();
        }}
        onDelete={() => {
          if (selected) confirmDelete(selected);
          close();
        }}
        onCopyText={() => {
          if (selected) void Clipboard.setStringAsync(selected.content).catch(fail);
          close();
        }}
        onSelectText={() => {
          setSelecting(selected);
          close();
        }}
      />
      <SelectTextSheet message={selecting} onClose={() => setSelecting(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  list: { flex: 1 },
  /** The list is inverted, so top is the gap above the composer and bottom is the gap under the oldest message. */
  listContent: { paddingTop: 16, paddingBottom: 16 },
  dock: { backgroundColor: theme.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notice: { color: theme.muted, textAlign: 'center', padding: 32 },
  retry: { color: theme.accent, fontSize: 16, fontWeight: '600' },
  error: { backgroundColor: theme.danger, paddingHorizontal: 14, paddingVertical: 8 },
  errorText: { color: '#ffffff', fontSize: 13 },
});
