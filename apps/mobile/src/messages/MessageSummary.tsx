import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import { formatMessageTime } from '@discordy/core/domain/messageTime';
import { Avatar } from '../profile/Avatar';
import { theme } from '../theme';
import { AttachmentList } from './attachments/AttachmentList';
import { MarkdownText } from './markdown/MarkdownText';
import { nameOf } from './MessageRow';

/** One message as a card outside a chat (pinned messages, search hits): author, time, text and attachments, with the screen's own actions below. Needs a `ChatContext` for the server's names. */
export function MessageSummary({ message, channelName, children }: { message: ChatMessage; channelName?: string; children?: ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Avatar user={message.author} size={24} />
        <Text numberOfLines={1} style={styles.author}>
          {nameOf(message.author)}
        </Text>
        {channelName ? (
          <Text numberOfLines={1} style={styles.where}>
            {`in #${channelName}`}
          </Text>
        ) : null}
        <Text style={styles.time}>{formatMessageTime(message.timestamp, Date.now())}</Text>
      </View>
      {message.content ? <MarkdownText source={message.content} /> : null}
      {message.attachments.length > 0 && <AttachmentList attachments={message.attachments} messageId={message.id} sending={false} />}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 12, marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: theme.raised },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  author: { flexShrink: 1, color: theme.text, fontSize: 15, fontWeight: '700' },
  where: { flexShrink: 1, color: theme.muted, fontSize: 13 },
  time: { marginLeft: 'auto', color: theme.subtle, fontSize: 12 },
});
