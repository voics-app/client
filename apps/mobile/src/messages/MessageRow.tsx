import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { reactionKey, type ChatMessage } from '@discordy/core/application/stores/messageStore';
import type { User } from '@discordy/core/contracts/rest';
import { replyPreviewText } from '@discordy/core/domain/chatDisplay';
import { formatMessageTime } from '@discordy/core/domain/messageTime';
import { isSystemType } from '@discordy/core/domain/systemMessage';
import { BRAND } from '../brand';
import { Avatar } from '../profile/Avatar';
import { theme } from '../theme';
import { AttachmentList } from './attachments/AttachmentList';
import { useChatContext } from './chatContext';
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
  onLongPress(message: ChatMessage): void;
  onToggleReaction(message: ChatMessage, emoji: string): void;
  onPressAuthor(user: User): void;
  onRetry(message: ChatMessage): void;
  onDiscard(message: ChatMessage): void;
}

function MessageRowView({ message, replied, showHeader, onLongPress, onToggleReaction, onPressAuthor, onRetry, onDiscard }: MessageRowProps) {
  const showReactions = usePrefsStore((s) => s.showReactions);
  const { guildId, onJumpToMessage, canReact, onMoreReactions, onWhoReacted, canReply, onReplyTo } = useChatContext();
  const roleColor = useRoleColor(guildId, message.author.id);
  if (isSystemType(message.type)) {
    const target = message.mentions?.[0];
    return <SystemRow message={message} authorName={nameOf(message.author)} targetName={target ? nameOf(target) : null} />;
  }
  const preview = replied ?? message.referenced_message ?? undefined;
  const referenceId = message.message_reference?.message_id;
  const row = (
    <Pressable onLongPress={() => onLongPress(message)} delayLongPress={300} style={[styles.row, showHeader && styles.groupStart, message.localState && styles.pending]}>
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
              <Text style={[styles.author, roleColor ? { color: roleColor } : null]}>{nameOf(message.author)}</Text>
            </Pressable>
            <Text style={styles.time}>{formatMessageTime(message.timestamp, Date.now())}</Text>
          </View>
        )}
        <MarkdownText source={message.content} trailing={message.edited_timestamp ? <Text style={styles.edited}> (edited)</Text> : null} />
        {message.attachments.length > 0 && <AttachmentList attachments={message.attachments} messageId={message.id} sending={message.localState === 'sending'} />}
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
  replyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24, marginBottom: 2 },
  replyName: { color: theme.muted, fontSize: 13, fontWeight: '600', maxWidth: '40%' },
  reply: { color: theme.muted, fontSize: 13, flexShrink: 1 },
  header: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 2 },
  author: { color: theme.text, fontWeight: '700', fontSize: 16 },
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
