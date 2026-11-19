import * as Clipboard from 'expo-clipboard';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { channelLink } from '@discordy/core/domain/channelMenuModel';
import { quickApiForm } from '@discordy/core/domain/quickReactions';
import type { ReportTarget } from '@discordy/core/domain/reportModel';
import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView, KeyboardGestureArea } from 'react-native-keyboard-controller';
import { errorMessage } from '@discordy/core/application/errorMessage';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useMessageStore, type ChatMessage } from '@discordy/core/application/stores/messageStore';
import { useReadNavStore } from '@discordy/core/application/stores/readNavStore';
import { useReadStateStore, useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { ChannelType, RelationshipType, type User } from '@discordy/core/contracts/rest';
import { headerButtons } from '@discordy/core/domain/chatHeader';
import { firstUnreadMessageId, unreadBar } from '@discordy/core/domain/unread';
import { buildRows, showJumpToLatest, type ChatRow } from './chatRows';
import { JumpToLatest, NewDivider, UnreadBar } from './UnreadMarkers';
import { ThinkingRows } from '../commands/ThinkingRows';
import { ChatContext, type ChatContextValue } from './chatContext';
import { ChatHeaderActions, ChatHeaderTitle } from './ChatHeader';
import { composerPlaceholder } from './composerPlaceholder';
import type { OutgoingFile } from './outgoingFile';
import { EmptyState } from '../ui/EmptyState';
import { MessageSkeletons } from '../ui/Skeleton';
import { MembersEdgeSwipe } from './MembersEdgeSwipe';
import { Composer, COMPOSER_INPUT_ID, type ComposerMode } from './Composer';
import { VoiceRecorder } from './VoiceRecorder';
import { ForwardSheet } from './ForwardSheet';
import { MessageActionSheet } from './MessageActionSheet';
import { AttachmentMetadataSheet } from './AttachmentMetadataSheet';
import { ReportSheet } from '../report/ReportSheet';
import { MessageRow, nameOf } from './MessageRow';
import { blockUser } from '../friends/friendActions';
import { confirmDestructive } from '../ui/attempt';
import { notifyError, notifySuccess, tapLight, tickSelection } from '../haptics';
import { ChannelDetails } from './ChannelDetails';
import { NewThreadSheet } from '../threads/NewThreadSheet';
import { isThread, threadBlockedReason } from '@discordy/core/domain/threads';
import { ChannelMenu } from './ChannelMenu';
import { EmojiPicker } from '../emoji/EmojiPicker';
import { ReactionUsersSheet, type ReactionTarget } from './ReactionUsersSheet';
import { SelectTextSheet } from './SelectTextSheet';
import { dmTitle } from '../dms/dmModel';
import { MembersButton } from '../members/MembersButton';
import { DELETE_PRIVATE_NOTE } from '@discordy/core/domain/disappearing';
import { ModeBadge } from '../privacy/ModeBadge';
import { PeerStatusBar } from '../privacy/PeerStatusBar';
import { SafetyNumberSheet } from '../privacy/SafetyNumberSheet';
import { getRuntime } from '../runtime';
import { ProfileSheet } from '../profile/ProfileSheet';
import { channelAccess, dmAccess, messageActions } from './messageAccess';
import { useAppActive } from './useAppActive';
import { useMessageService } from './useMessageService';
import { useJumpToMessage } from './useJumpToMessage';
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
  const guild = useGuildStore((s) => (guildId ? s.guilds[guildId] : undefined));
  const channel = useGuildStore((s) => s.channels[channelId]);
  const parent = useGuildStore((s) => (channel?.parent_id ? s.channels[channel.parent_id] : undefined));
  const members = useGuildStore((s) => (guildId ? s.members[guildId] : undefined));
  const relationships = useRelationshipStore((s) => s.byUser);
  const userId = useSessionStore((s) => s.user?.id);
  const timeline = useMessageStore((s) => s.timelines[channelId]);

  const [mode, setMode] = useState<ComposerMode>(COMPOSE);
  const [selected, setSelected] = useState<ChatMessage | null>(null);
  const [editingAttachments, setEditingAttachments] = useState<ChatMessage | null>(null);
  const [selecting, setSelecting] = useState<ChatMessage | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [forwarding, setForwarding] = useState<ChatMessage | null>(null);
  const [reporting, setReporting] = useState<ReportTarget | null>(null);
  const [threadFrom, setThreadFrom] = useState<ChatMessage | null>(null);
  const [reactingTo, setReactingTo] = useState<string | null>(null);
  const [reactors, setReactors] = useState<ReactionTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [safetyPeer, setSafetyPeer] = useState<string | null>(null);
  // Ephemeral and P2P chats open only where the native crypto module exists; Expo Go keeps the notice.
  const privateModes = Boolean(getRuntime().privacy);

  const access = useMemo(() => {
    if (!channel || !userId) return null;
    if (!guildId) return channel.guild_id ? null : dmAccess(channel);
    return guild ? channelAccess({ guild, channel, members, userId, parent }) : null;
  }, [guildId, guild, channel, members, userId, parent]);
  const thread = isThread(channel);
  const peer = !guildId && channel && headerButtons(channel).profile ? channel.recipients![0]! : null;
  const title = !channel ? '' : guildId ? (thread ? (channel.name ?? 'Thread') : `#${channel.name}`) : dmTitle(channel, relationships);
  const readable = access !== null && (access.standard || privateModes) && access.canReadHistory;
  const loaded = timeline?.loaded ?? false;
  const detached = timeline?.hasMoreAfter ?? false;

  const loadLatest = useCallback(() => {
    setLoadFailed(false);
    service.loadLatest(channelId).catch((e: unknown) => {
      setLoadFailed(true);
      setError(errorMessage(e));
    });
  }, [service, channelId]);

  useEffect(() => {
    if (readable && !loaded && useReadNavStore.getState().jump?.channelId !== channelId) loadLatest();
    // Only the first open of a channel loads the latest page; later updates arrive from the gateway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readable, channelId]);

  useEffect(() => () => service.saveRecent(channelId), [service, channelId]);

  const anchor = useReadNavStore((st) => st.anchors[channelId]);
  const barDismissed = useReadNavStore((st) => st.barDismissed[channelId] ?? false);
  useEffect(() => {
    // The read marker as it was when the chat opened drives the "New" divider; acking the latest message below does not move it.
    useReadNavStore.getState().captureAnchor(channelId, useReadStateStore.getState().byChannel[channelId]?.lastReadId ?? null);
    return () => useReadNavStore.getState().releaseAnchor(channelId);
  }, [channelId]);

  const markers = useMemo(() => (timeline ? timeline.ids.flatMap((id) => (timeline.byId[id] && !timeline.byId[id]!.localState ? [{ id, authorId: timeline.byId[id]!.author.id }] : [])) : []), [timeline]);
  const firstUnreadId = useMemo(() => firstUnreadMessageId(markers, anchor, userId), [markers, anchor, userId]);
  const rows = useMemo<ChatRow[]>(() => {
    if (!timeline) return [];
    return buildRows(timeline.ids.flatMap((id) => timeline.byId[id] ?? []), firstUnreadId);
  }, [timeline, firstUnreadId]);
  const bar = useMemo(() => {
    if (barDismissed || !anchor) return null;
    const model = unreadBar(markers, anchor, userId, timeline?.hasMoreBefore ?? false);
    return model && model.count > 0 ? model : null;
  }, [barDismissed, anchor, markers, userId, timeline?.hasMoreBefore]);

  const latestId = useMemo(() => {
    const ids = timeline?.ids ?? [];
    return ids.findLast((id) => !timeline?.byId[id]?.localState) ?? null;
  }, [timeline]);
  const appActive = useAppActive();
  useEffect(() => {
    if (appActive && readable && loaded && !detached && latestId) service.markRead(channelId, latestId);
  }, [appActive, service, channelId, readable, loaded, detached, latestId]);

  const listRef = useRef<FlatList<ChatRow>>(null);
  const [away, setAway] = useState(false);
  const openedAt = useRef<string | null>(null);
  useEffect(() => {
    // Open at the first unread message once the history is in; later arrivals do not move the list.
    if (!loaded || openedAt.current === channelId) return;
    if (useReadNavStore.getState().jump?.channelId === channelId) {
      openedAt.current = channelId;
      return;
    }
    const index = rows.findIndex((row) => row.kind === 'new');
    if (index < 0 && !firstUnreadId) return;
    openedAt.current = channelId;
    if (index >= 4) listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, channelId, firstUnreadId]);
  const jumpTo = useCallback((messageId: string) => useReadNavStore.getState().requestJump(channelId, messageId), [channelId]);
  const findUser = useCallback(
    (id: string): User | undefined => {
      const member = guildId ? useGuildStore.getState().members[guildId]?.[id] : undefined;
      if (member?.user) return member.user;
      for (const m of Object.values(timeline?.byId ?? {})) {
        if (m.author.id === id) return m.author;
        const mentioned = m.mentions?.find((u) => u.id === id);
        if (mentioned) return mentioned;
      }
      return undefined;
    },
    [guildId, timeline],
  );

  const fail = useCallback((e: unknown) => setError(errorMessage(e)), []);
  const { flashId } = useJumpToMessage({
    channel,
    rows,
    service,
    listRef,
    onFailed: (reason) => {
      setError(reason);
      if (!loaded) loadLatest();
    },
  });

  const submit = useCallback(
    (text: string, current: ComposerMode, files: OutgoingFile[]) => {
      if (!channel) return;
      setMode(COMPOSE);
      setError(null);
      if (current.kind === 'edit') service.edit(channelId, current.messageId, text).catch(fail);
      else void service.send(channel, { content: text, ...(files.length > 0 ? { files } : {}), ...(current.kind === 'reply' ? { replyTo: current.messageId } : {}) }).then((ok) => (ok ? notifySuccess() : notifyError()));
    },
    [service, channel, channelId, fail],
  );

  const toggleReaction = useCallback(
    (message: ChatMessage, emoji: string) => {
      setError(null);
      tickSelection();
      service.toggleReaction(channelId, message.id, emoji).catch(fail);
    },
    [service, channelId, fail],
  );

  const confirmDelete = (message: ChatMessage) =>
    Alert.alert(access?.standard === false ? 'Delete for everyone?' : 'Delete message?', access?.standard === false ? DELETE_PRIVATE_NOTE : 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void service.remove(channelId, message.id).catch(fail) },
    ]);

  const confirmBlock = (author: User) =>
    confirmDestructive(`Block ${nameOf(author)}?`, 'They will not be able to message you or send a friend request, and you will not be friends any more.', 'Block', () => void blockUser(author.id));

  const chat = useMemo<ChatContextValue>(
    () => ({
      guildId,
      canManageMessages: access?.canManageMessages ?? false,
      onPressUser: (id) => {
        const user = findUser(id);
        if (user) setProfileUser(user);
      },
      onPressChannel: (id) => {
        if (guildId) router.push(`/servers/${guildId}/${id}`);
      },
      onJumpToMessage: jumpTo,
      onOpenPins: () => router.push(`/pins/${channelId}`),
      onOpenThread: (id) => {
        if (!guildId) return;
        // A thread known only from the message that carries it joins the channel list so its chat can open.
        const known = Object.values(timeline?.byId ?? {}).find((m) => m.thread?.id === id)?.thread;
        if (known && !useGuildStore.getState().channels[id]) useGuildStore.getState().upsertChannel({ ...known, guild_id: known.guild_id ?? guildId });
        router.push(`/servers/${guildId}/${id}`);
      },
      canReact: access?.canReact ?? false,
      canReply: access?.canSend ?? false,
      onReplyTo: (m) => {
        tapLight();
        setMode({ kind: 'reply', messageId: m.id, authorName: nameOf(m.author) });
      },
      onMoreReactions: setReactingTo,
      onWhoReacted: (messageId, emoji) => setReactors({ channelId, messageId, emoji }),
      onWave: (id) => {
        if (channel) void service.send(channel, { content: '\u{1F44B}', replyTo: id });
      },
    }),
    [guildId, channelId, access, findUser, jumpTo, channel, service, timeline],
  );

  const lockedReason = channel && thread ? threadBlockedReason(channel, access?.canManageThreads ?? false) : null;
  const blockedReason = !access ? null : !access.standard && !privateModes ? PRIVATE_NOTICE : lockedReason ?? (!access.canSend ? NO_SEND_NOTICE : null);
  const actions = selected && access && userId ? messageActions(selected, access, userId, relationships[selected.author.id]?.type === RelationshipType.BLOCKED) : null;
  const close = () => setSelected(null);

  return (
    <ChatContext.Provider value={chat}>
      <View style={styles.screen}>
        <KeyboardAvoidingView behavior="padding" automaticOffset keyboardVerticalOffset={-insets.bottom} style={styles.list}>
        <KeyboardGestureArea interpolator="ios" textInputNativeID={COMPOSER_INPUT_ID} style={styles.list}>
        <Stack.Screen
          options={{
            headerTitle: () => <ChatHeaderTitle title={title} peer={peer} onPress={() => (peer ? setProfileUser(peer) : setDetailsOpen(true))} />,
            headerRight: () => <ChatHeaderActions calls={!guildId} onProfile={peer ? () => setProfileUser(peer) : undefined} trailing={guildId ? <MembersButton guildId={guildId} /> : undefined} onMenu={() => setMenuOpen(true)} />,
          }}
        />
        {channel && (
          <View style={styles.modeStrip}>
            <ModeBadge mode={channel.delivery_mode ?? 'standard'} />
          </View>
        )}
        {bar && <UnreadBar count={bar.count} more={bar.more} onMarkRead={() => useReadNavStore.getState().dismissBar(channelId)} />}
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
              <MessageSkeletons />
            )}
          </View>
        ) : (
          <View style={styles.list}>
          <FlatList
            ref={listRef}
            onScrollToIndexFailed={(info) => listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true })}
            testID="message-list"
            style={styles.list}
            inverted
            maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 32 }}
            contentContainerStyle={styles.listContent}
            data={rows}
            keyExtractor={(row) => row.key}
            onScroll={(e) => setAway(showJumpToLatest(e.nativeEvent.contentOffset.y, e.nativeEvent.layoutMeasurement.height))}
            scrollEventThrottle={100}
            onEndReached={() => void service.loadOlder(channelId).catch(fail)}
            onEndReachedThreshold={0.5}
            onStartReached={() => void service.loadNewer(channelId).catch(fail)}
            onStartReachedThreshold={0.5}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            ListHeaderComponent={<ThinkingRows channelId={channelId} />}
            ListEmptyComponent={<EmptyState icon="chatbubbles-outline" title="No messages yet" body="Say hello." />}
            renderItem={({ item }) =>
              item.kind === 'new' ? (
                <NewDivider />
              ) : (
              <MessageRow
                message={item.message}
                showHeader={item.showHeader}
                highlighted={item.message.id === flashId}
                replied={item.message.message_reference?.message_id ? timeline?.byId[item.message.message_reference.message_id] : undefined}
                onLongPress={(m) => {
                  tapLight();
                  setSelected(m);
                }}
                onToggleReaction={toggleReaction}
                onPressAuthor={setProfileUser}
                onRetry={(m) => channel && void service.retry(channel, m.id)}
                onDiscard={(m) => service.discard(channelId, m.id)}
              />
              )
            }
          />
          </View>
        )}
        </KeyboardGestureArea>
        {guildId && <MembersEdgeSwipe guildId={guildId} />}
        <View style={[styles.dock, { paddingBottom: insets.bottom }]}>
        {readable && loaded && (away || detached) && (
          <JumpToLatest
            onPress={() => {
              if (detached) loadLatest();
              listRef.current?.scrollToOffset({ offset: 0, animated: true });
            }}
          />
        )}
          {channel && <PeerStatusBar channelId={channelId} mode={channel.delivery_mode ?? 'standard'} {...(peer ? { onSafetyNumber: () => setSafetyPeer(peer.id) } : {})} />}
          {channel && access?.standard && <VoiceRecorder disabled={Boolean(blockedReason) || !access.canAttach || !access.canSendVoice} onSend={(file, voice) => service.send(channel, { content: '', files: [file], voice })} />}
          <Composer mode={mode} blockedReason={blockedReason} guildId={guildId} {...(access?.standard ? { draftKey: channelId } : {})} {...(access?.standard && access.canUseCommands && channel ? { slashChannel: channel } : {})} canAttach={access?.canAttach ?? false} placeholder={composerPlaceholder(channel, relationships)} onSubmit={submit} onCancelMode={() => setMode(COMPOSE)} />
        </View>
        </KeyboardAvoidingView>
        <ForwardSheet message={forwarding} onClose={() => setForwarding(null)} />
        <AttachmentMetadataSheet message={editingAttachments} onClose={() => setEditingAttachments(null)} />
        <ReportSheet target={reporting} onClose={() => setReporting(null)} />
        <NewThreadSheet message={threadFrom} onClose={() => setThreadFrom(null)} />
        <SafetyNumberSheet peerId={safetyPeer} onClose={() => setSafetyPeer(null)} />
        <ProfileSheet user={profileUser} {...(guildId ? { guildId } : {})} onClose={() => setProfileUser(null)} />
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
          onCreateThread={() => {
            setThreadFrom(selected);
            close();
          }}
          onEdit={() => {
            if (selected) setMode({ kind: 'edit', messageId: selected.id, content: selected.content });
            close();
          }}
          onEditAttachments={() => {
            setEditingAttachments(selected);
            close();
          }}
          onDelete={() => {
            if (selected) confirmDelete(selected);
            close();
          }}
          onMoreReactions={() => {
            setReactingTo(selected?.id ?? null);
            close();
          }}
          onCopyLink={() => {
            if (selected) void Clipboard.setStringAsync(channelLink(guildId, channelId, selected.id)).catch(fail);
            close();
          }}
          onMarkUnread={() => {
            if (selected) service.markUnread(channelId, selected.id);
            close();
          }}
          onPin={() => {
            if (selected) service.setPinned(channelId, selected.id, !selected.pinned).catch(fail);
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
          onForward={() => {
            setForwarding(selected);
            close();
          }}
          onBlock={() => {
            if (selected) confirmBlock(selected.author);
            close();
          }}
          onReport={() => {
            if (selected && channel) setReporting({ kind: 'message', channelId, messageId: selected.id, authorId: selected.author.id, authorName: nameOf(selected.author), content: selected.content, mode: selected.deliveryMode ?? channel.delivery_mode ?? 'standard' });
            close();
          }}
        />
        <ChannelDetails
          visible={detailsOpen}
          channel={channel}
          title={title}
          guildId={guildId}
          onClose={() => setDetailsOpen(false)}
          onOpenPins={() => router.push(`/pins/${channelId}`)}
          onOpenSearch={() => router.push(`/search/${channelId}`)}
          onOpenMembers={() => guildId && router.push(`/servers/${guildId}/members`)}
          onOpenThreads={guildId && !thread ? () => router.push(`/threads/${channelId}`) : undefined}
          onOpenProfile={setProfileUser}
          onOpenGroupSettings={!guildId && channel?.type === ChannelType.GROUP_DM ? () => router.push(`/groups/${channelId}`) : undefined}
        />
        <ChannelMenu visible={menuOpen} guildId={guildId} channelId={channelId} onSearch={() => router.push(`/search/${channelId}`)} onClose={() => setMenuOpen(false)} onMarkRead={() => {
            useReadNavStore.getState().dismissBar(channelId);
            if (latestId) service.markRead(channelId, latestId);
          }} />
        <EmojiPicker
          visible={reactingTo !== null}
          guildId={guildId}
          onClose={() => setReactingTo(null)}
          onPick={(emoji) => {
            const target = reactingTo ? timeline?.byId[reactingTo] : undefined;
            if (target) {
              usePrefsStore.getState().recordReaction(emoji);
              toggleReaction(target, quickApiForm(emoji));
            }
            setReactingTo(null);
          }}
        />
        <ReactionUsersSheet target={reactors} onClose={() => setReactors(null)} />
        <SelectTextSheet message={selecting} onClose={() => setSelecting(null)} />
      </View>
    </ChatContext.Provider>
  );
}

const styles = StyleSheet.create({
  modeStrip: { paddingHorizontal: 14, paddingVertical: 6 },
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
