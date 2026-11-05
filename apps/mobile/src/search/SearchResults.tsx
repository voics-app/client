import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { Message } from '@discordy/core/contracts/rest';
import { formatBytes } from '@discordy/core/domain/media';
import { formatMessageTime } from '@discordy/core/domain/messageTime';
import { splitHighlight } from '@discordy/core/domain/messageSearch';
import { openLink } from '../messages/markdown/links';
import { nameOf } from '../messages/MessageRow';
import { Avatar } from '../profile/Avatar';
import { theme } from '../theme';
import type { FileRow, LinkRow, MediaTile } from './searchTabs';

const COLUMNS = 3;

function Highlighted({ text, terms, style }: { text: string; terms: string[]; style: object }) {
  return (
    <Text style={style}>
      {splitHighlight(text, terms).map((part, i) => (
        <Text key={i} style={part.hit ? styles.hit : undefined}>
          {part.text}
        </Text>
      ))}
    </Text>
  );
}

const snippet = (message: Message) => message.content || (message.attachments.length > 0 ? `${message.attachments.length} attachment${message.attachments.length === 1 ? '' : 's'}` : '');

/** A messages-tab result: who wrote it, where and when, the text with the search words marked, and the messages around it. */
export function MessageHit({ group, terms, channelName, onOpen }: { group: Message[]; terms: string[]; channelName: string | undefined; onOpen(message: Message): void }) {
  const hit = group.find((m) => m.hit) ?? group[0]!;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Jump to message from ${nameOf(hit.author)}`} onPress={() => onOpen(hit)} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.header}>
        <Avatar user={hit.author} size={24} />
        <Text numberOfLines={1} style={styles.author}>
          {nameOf(hit.author)}
        </Text>
        {channelName ? (
          <Text numberOfLines={1} style={styles.where}>
            {`in #${channelName}`}
          </Text>
        ) : null}
        <Text style={styles.time}>{formatMessageTime(hit.timestamp, Date.now())}</Text>
      </View>
      {group.map((m) =>
        m === hit ? (
          <Highlighted key={m.id} text={snippet(m)} terms={terms} style={styles.hitLine} />
        ) : (
          <Text key={m.id} numberOfLines={2} style={styles.context}>{`${nameOf(m.author)}: ${snippet(m)}`}</Text>
        ),
      )}
    </Pressable>
  );
}

/** The Media tab: images and videos in a grid; tapping one opens its message. */
export function MediaGrid({ tiles, onOpen }: { tiles: readonly MediaTile[]; onOpen(message: Message): void }) {
  const { width } = useWindowDimensions();
  const size = (width - 2 * (COLUMNS - 1)) / COLUMNS;
  return (
    <View style={styles.grid}>
      {tiles.map((tile) => (
        <Pressable key={tile.key} accessibilityRole="imagebutton" accessibilityLabel={`${tile.video ? 'Video' : 'Image'} from ${nameOf(tile.message.author)}`} onPress={() => onOpen(tile.message)} style={{ width: size, height: size }}>
          {tile.video ? (
            <View style={styles.video}>
              <Ionicons name="play-circle" size={36} color={theme.text} />
            </View>
          ) : (
            <Image source={{ uri: tile.attachment.url }} contentFit="cover" style={styles.image} />
          )}
        </Pressable>
      ))}
    </View>
  );
}

function RowShell({ icon, title, subtitle, caption, openLabel, onPress, onJump, jumpLabel }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; caption: string; openLabel: string; onPress(): void; onJump(): void; jumpLabel: string }) {
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={openLabel} onPress={onPress} style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}>
        <Ionicons name={icon} size={24} color={theme.muted} />
        <View style={styles.rowCopy}>
          <Text numberOfLines={1} style={styles.rowTitle}>
            {title}
          </Text>
          <Text numberOfLines={1} style={styles.rowSub}>
            {subtitle}
          </Text>
          <Text numberOfLines={1} style={styles.rowCaption}>
            {caption}
          </Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={jumpLabel} onPress={onJump} style={styles.jump}>
        <Ionicons name="arrow-redo-outline" size={20} color={theme.accent} />
      </Pressable>
    </View>
  );
}

const caption = (message: Message) => `${nameOf(message.author)} - ${formatMessageTime(message.timestamp, Date.now())}`;

/** A Files-tab row: the file's name and size; tapping opens the file, the arrow opens its message. */
export function FileResult({ row, onOpen }: { row: FileRow; onOpen(message: Message): void }) {
  return (
    <RowShell
      icon="document-outline"
      title={row.name}
      subtitle={formatBytes(row.attachment.size)}
      caption={caption(row.message)}
      openLabel={`Open file ${row.name}`}
      onPress={() => openLink(row.attachment.url)}
      jumpLabel={`Jump to message with ${row.name}`}
      onJump={() => onOpen(row.message)}
    />
  );
}

/** A Links-tab row: the site and address; tapping opens the link, the arrow opens its message. */
export function LinkResult({ row, onOpen }: { row: LinkRow; onOpen(message: Message): void }) {
  return (
    <RowShell
      icon="link-outline"
      title={row.host}
      subtitle={row.url}
      caption={caption(row.message)}
      openLabel={`Open link ${row.url}`}
      onPress={() => openLink(row.url)}
      jumpLabel={`Jump to message with link to ${row.host}`}
      onJump={() => onOpen(row.message)}
    />
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 12, marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: theme.raised },
  pressed: { backgroundColor: theme.raisedHover },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  author: { flexShrink: 1, color: theme.text, fontSize: 15, fontWeight: '700' },
  where: { flexShrink: 1, color: theme.muted, fontSize: 13 },
  time: { marginLeft: 'auto', color: theme.subtle, fontSize: 12 },
  hitLine: { color: theme.text, fontSize: 15, lineHeight: 21 },
  hit: { backgroundColor: theme.accentSoft, color: theme.text, fontWeight: '700' },
  context: { color: theme.subtle, fontSize: 13, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  image: { flex: 1, backgroundColor: theme.raised },
  video: { flex: 1, backgroundColor: theme.raised, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.hairline },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingLeft: 16, paddingVertical: 8 },
  rowCopy: { flex: 1 },
  rowTitle: { color: theme.text, fontSize: 15, fontWeight: '600' },
  rowSub: { color: theme.muted, fontSize: 13 },
  rowCaption: { color: theme.subtle, fontSize: 12, marginTop: 1 },
  jump: { width: 52, minHeight: 64, alignItems: 'center', justifyContent: 'center' },
});
