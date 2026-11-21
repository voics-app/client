import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { reactionKey, type ChatMessage } from '@discordy/core/application/stores/messageStore';
import type { User } from '@discordy/core/contracts/rest';
import { forwardSnapshot } from '@discordy/core/domain/forward';
import { roleColorStyle } from '@discordy/core/domain/appearance';
import { replyPreviewText } from '@discordy/core/domain/chatDisplay';
import { formatMessageTime } from '@discordy/core/domain/messageTime';
import { isSystemType } from '@discordy/core/domain/systemMessage';
import { BRAND } from '../brand';
import { Avatar } from '../profile/Avatar';
import { theme } from '../theme';
import { AttachmentList } from './attachments/AttachmentList';
import { MessageComponents } from './components/MessageComponents';
import { useChatContext } from './chatContext';
import { InviteCards } from '../invites/InviteCards';
import { MarkdownText } from './markdown/MarkdownText';
import { SwipeToReply } from './SwipeToReply';
import { SystemRow } from './SystemRow';
import { useRoleColor } from './useRoleColor';

export const AVATAR_SIZE = 40;

export const nameOf = (user: Pick<User, 'username' | 'global_name'>): string => user.global_name || user.username;

export interface MessageRowProps {
  message: ChatMessage;
  /** The message this one replies to, when it is in the timeline. */
  replied: ChatMessage | undefined;
  showHeader: boolean;
  /** Briefly marked after a jump to this message. */
  highlighted?: boolean;
  onLongPress(message: ChatMessage): void;
  onToggleReaction(message: ChatMessage, emoji: string): void;
  onPressAuthor(user: User): void;
  onRetry(message: ChatMessage): void;
  onDiscard(message: ChatMessage): void;
}

function MessageRowView({ message, replied, showHeader, highlighted, onLongPress, onToggleReaction, onPressAuthor, onRetry, onDiscard }: MessageRowProps) {
  const showReactions = usePrefsStore((s) => s.showReactions);
  const { guildId, onJumpToMessage, canReact, onMoreReactions, onWhoReacted, canReply, onReplyTo, onOpenThread } = useChatContext();
  const roleColorMode = usePrefsStore((s) => s.roleColors);
  const role = roleColorStyle(useRoleColor(guildId, message.author.id), roleColorMode);
  if (isSystemType(message.type)) {
    const target = message.mentions?.[0];
    return <SystemRow message={message} authorName={nameOf(message.author)} targetName={target ? nameOf(target) : null} />;
  }
  const forwarded = forwardSnapshot(message);
  const preview = replied ?? message.referenced_message ?? undefined;
  const referenceId = message.message_reference?.message_id;
  const row = (
    <Pressable onLongPress={() => onLongPress(message)} delayLongPress={300} style={[styles.row, showHeader && styles.groupStart, message.localState && styles.pending, highlighted && styles.highlight]}>
      <View style={styles.gutter}>
        {showHeader && (
          <Pressable accessibilityRole="button" accessibilityLabel={`View profile of ${nameOf(message.author)} avatar`} onPress={() => onPressAuthor(message.author)}>
            <Avatar user={message.author} size={AVATAR_SIZE} />
          </Pressable>
        )}
      </View>
      <View style={styles.body}>
        {message.message_reference && (
          <Pressable accessibilityRole="button" accessibilityLabel="Jump to the original message" disabled={!referenceId} onPress={() => referenceId && onJumpToMessage(referenceId)} style={styles.replyRow}>
            <Ionicons name="return-up-forward" size={14} color={theme.subtle} />
            {preview ? (
              <>
                <Avatar user={preview.author} size={16} />
                <Text style={styles.replyName} numberOfLines={1}>{`@${nameOf(preview.author)}`}</Text>
                <Text style={styles.reply} numberOfLines={1}>
                  {replyPreviewText(preview.content, false) || 'Attachment'}
                </Text>
              </>
            ) : (
              <Text style={styles.reply} numberOfLines={1}>
                {message.referenced_message === null ? 'Original message was deleted' : 'Original message unavailable'}
              </Text>
            )}
          </Pressable>
        )}
        {showHeader && (
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel={`View profile of ${nameOf(message.author)}`} onPress={() => onPressAuthor(message.author)}>
              <View style={styles.authorLine}>
                {role.dot && <View testID="role-dot" style={[styles.roleDot, { backgroundColor: role.dot }]} />}
                <Text style={[styles.author, role.tint ? { color: role.tint } : null]}>{nameOf(message.author)}</Text>
              </View>
            </Pressable>
            <Text style={styles.time}>{formatMessageTime(message.timestamp, Date.now())}</Text>
          </View>
        )}
        {(message.content !== '' || !forwarded) && <MarkdownText source={message.content} trailing={message.edited_timestamp ? <Text style={styles.edited}> (edited)</Text> : null} />}
        {forwarded && (
          <View accessibilityLabel="Forwarded message" style={styles.forwarded}>
            <Text style={styles.forwardedLabel}>Forwarded</Text>
            {forwarded.content !== '' && <MarkdownText source={forwarded.content} />}
            {forwarded.attachments.length > 0 && <AttachmentList attachments={forwarded.attachments} messageId={`${message.id}-fwd`} sending={false} />}
          </View>
        )}
        {message.content !== '' && <InviteCards content={message.content} />}
        {message.attachments.length > 0 && <AttachmentList attachments={message.attachments} messageId={message.id} channelId={message.channel_id} sending={message.localState === 'sending'} />}
        {!message.localState && <MessageComponents message={message} />}
        {showReactions && message.reactions && message.reactions.length > 0 && (
          <View style={styles.reactions}>
            {message.reactions.map((r) => {
              const emoji = reactionKey(r.emoji);
              return (
                <Pressable
                  key={emoji}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.emoji.name ?? '?'} ${r.count}${r.me ? ', you reacted' : ''}`}
                  onPress={() => onToggleReaction(message, emoji)}
                  onLongPress={() => onWhoReacted(message.id, emoji)}
                  delayLongPress={300}
                  style={[styles.chip, r.me && styles.chipMine]}
                >
                  {r.emoji.id ? <Image source={{ uri: `${BRAND.cdnUrl}/emojis/${r.emoji.id}.${r.emoji.animated ? 'gif' : 'png'}` }} style={styles.chipEmoji} /> : <Text style={styles.chipText}>{r.emoji.name}</Text>}
                  <Text style={styles.chipText}>{r.count}</Text>
                </Pressable>
              );
            })}
            {canReact && (
              <Pressable accessibilityRole="button" accessibilityLabel="Add reaction" onPress={() => onMoreReactions(message.id)} style={styles.chip}>
                <Ionicons name="happy-outline" size={16} color={theme.muted} />
              </Pressable>
            )}
          </View>
        )}
        {message.thread && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Open thread ${message.thread.name ?? 'thread'}`} onPress={() => onOpenThread(message.thread!.id)} style={styles.thread}>
            <Ionicons name="chatbubbles-outline" size={16} color={theme.accent} />
            <Text numberOfLines={1} style={styles.threadName}>{message.thread.name ?? 'Thread'}</Text>
            <Text style={styles.threadCount}>{`${message.thread.message_count ?? 0} messages`}</Text>
          </Pressable>
        )}
        {message.localState === 'failed' && (
          <View style={styles.failed}>
            <Text style={styles.failedText}>Not sent: {message.error ?? 'Something went wrong.'}</Text>
            <Pressable accessibilityRole="button" onPress={() => onRetry(message)}>
              <Text style={styles.action}>Retry</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => onDiscard(message)}>
              <Text style={styles.action}>Discard</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Pressable>
  );
  return canReply && !message.localState ? <SwipeToReply onReply={() => onReplyTo(message)}>{row}</SwipeToReply> : row;
}

export const MessageRow = memo(MessageRowView);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 2 },
  groupStart: { marginTop: 16 },
  gutter: { width: AVATAR_SIZE, paddingTop: 2 },
  body: { flex: 1 },
  pending: { opacity: 0.6 },
  thread: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 44, maxWidth: '100%' },
  threadName: { color: theme.accent, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  threadCount: { color: theme.subtle, fontSize: 12 },
  highlight: { backgroundColor: theme.accentSoft },
  replyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24, marginBottom: 2 },
  replyName: { color: theme.muted, fontSize: 13, fontWeight: '600', maxWidth: '40%' },
  reply: { color: theme.muted, fontSize: 13, flexShrink: 1 },
  header: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 2 },
  author: { color: theme.text, fontWeight: '700', fontSize: 16 },
  forwarded: { marginTop: 4, paddingLeft: 10, borderLeftWidth: 3, borderLeftColor: theme.hairlineStrong },
  forwardedLabel: { color: theme.subtle, fontSize: 12, fontWeight: '600', marginBottom: 2 },
  authorLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roleDot: { width: 10, height: 10, borderRadius: 5 },
  time: { color: theme.muted, fontSize: 12 },
  edited: { color: theme.muted, fontSize: 12 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28, backgroundColor: theme.surface, borderRadius: 8, paddingHorizontal: 8, borderWidth: 1, borderColor: theme.surface },
  chipEmoji: { width: 16, height: 16 },
  chipMine: { borderColor: theme.accent },
  chipText: { color: theme.text, fontSize: 13 },
  failed: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' },
  failedText: { color: theme.danger, fontSize: 12, flexShrink: 1 },
  action: { color: theme.accent, fontSize: 13, fontWeight: '600' },
});
