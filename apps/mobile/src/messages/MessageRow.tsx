import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { reactionKey, type ChatMessage } from '@discordy/core/application/stores/messageStore';
import type { User } from '@discordy/core/contracts/rest';
import { replyPreviewText } from '@discordy/core/domain/chatDisplay';
import { formatMessageTime } from '@discordy/core/domain/messageTime';
import { isSystemType } from '@discordy/core/domain/systemMessage';
import { theme } from '../theme';

export const nameOf = (user: Pick<User, 'username' | 'global_name'>): string => user.global_name || user.username;

export interface MessageRowProps {
  message: ChatMessage;
  /** The message this one replies to, when it is in the timeline. */
  replied: ChatMessage | undefined;
  showHeader: boolean;
  onLongPress(message: ChatMessage): void;
  onToggleReaction(message: ChatMessage, emoji: string): void;
  onRetry(message: ChatMessage): void;
  onDiscard(message: ChatMessage): void;
}

function MessageRowView({ message, replied, showHeader, onLongPress, onToggleReaction, onRetry, onDiscard }: MessageRowProps) {
  if (isSystemType(message.type)) {
    return <Text style={styles.system}>{nameOf(message.author)} - system message</Text>;
  }
  const preview = replied ?? message.referenced_message ?? undefined;
  return (
    <Pressable onLongPress={() => onLongPress(message)} delayLongPress={300} style={[styles.row, showHeader && styles.groupStart, message.localState && styles.pending]}>
      {message.message_reference && (
        <Text style={styles.reply} numberOfLines={1}>
          {preview ? `${nameOf(preview.author)}: ${replyPreviewText(preview.content, true)}` : 'Original message unavailable'}
        </Text>
      )}
      {showHeader && (
        <View style={styles.header}>
          <Text style={styles.author}>{nameOf(message.author)}</Text>
          <Text style={styles.time}>{formatMessageTime(message.timestamp, Date.now())}</Text>
        </View>
      )}
      <Text style={styles.content}>
        {message.content}
        {message.edited_timestamp ? <Text style={styles.edited}> (edited)</Text> : null}
      </Text>
      {message.attachments.length > 0 && <Text style={styles.edited}>{message.attachments.length} attachment(s), shown in a later release</Text>}
      {message.reactions && message.reactions.length > 0 && (
        <View style={styles.reactions}>
          {message.reactions.map((r) => {
            const emoji = reactionKey(r.emoji);
            return (
              <Pressable
                key={emoji}
                accessibilityRole="button"
                accessibilityLabel={`${r.emoji.name ?? '?'} ${r.count}${r.me ? ', you reacted' : ''}`}
                onPress={() => onToggleReaction(message, emoji)}
                style={[styles.chip, r.me && styles.chipMine]}
              >
                <Text style={styles.chipText}>
                  {r.emoji.name} {r.count}
                </Text>
              </Pressable>
            );
          })}
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
    </Pressable>
  );
}

export const MessageRow = memo(MessageRowView);

const styles = StyleSheet.create({
  row: { paddingHorizontal: 14, paddingVertical: 2 },
  groupStart: { marginTop: 12 },
  pending: { opacity: 0.6 },
  reply: { color: theme.muted, fontSize: 12, marginBottom: 2 },
  header: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  author: { color: theme.text, fontWeight: '700', fontSize: 15 },
  time: { color: theme.muted, fontSize: 11 },
  content: { color: theme.text, fontSize: 15 },
  edited: { color: theme.muted, fontSize: 11 },
  system: { color: theme.muted, fontSize: 12, fontStyle: 'italic', paddingHorizontal: 14, paddingVertical: 6 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { backgroundColor: theme.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: theme.surface },
  chipMine: { borderColor: theme.accent },
  chipText: { color: theme.text, fontSize: 13 },
  failed: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' },
  failedText: { color: theme.danger, fontSize: 12, flexShrink: 1 },
  action: { color: theme.accent, fontSize: 13, fontWeight: '600' },
});
