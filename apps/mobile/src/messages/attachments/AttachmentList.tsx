import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useUploadStore } from '@discordy/core/application/stores/uploadStore';
import type { Attachment } from '@discordy/core/contracts/rest';
import { displayFilename, formatBytes, isSpoiler, previewKind, splitAttachments } from '@discordy/core/domain/media';
import { theme } from '../../theme';
import { openLink } from '../markdown/links';
import { singleMediaSize, tileRows, uploadLabel } from './attachmentModel';
import { MediaViewer } from './MediaViewer';

/** The attachments of one message: an image and video grid, then audio and file rows; unsent messages show their upload progress with Cancel. */
export function AttachmentList({ attachments, messageId, sending }: { attachments: Attachment[]; messageId: string; sending: boolean }) {
  const { width } = useWindowDimensions();
  const [viewing, setViewing] = useState<{ items: Attachment[]; index: number } | null>(null);
  const inlineMedia = usePrefsStore((s) => s.inlineMedia);
  const split = splitAttachments(attachments);
  // Chat > Display images and videos: when off, they show as file rows instead of inline.
  const media = inlineMedia ? split.media : [];
  const files = inlineMedia ? split.files : attachments;
  const openMedia = (index: number) => {
    const selected = media[index];
    if (!selected) return;
    // Opening one revealed tile must not reveal its concealed neighbours.
    const items = media.filter((item) => item.id === selected.id || !isSpoiler(item));
    setViewing({ items, index: items.findIndex((item) => item.id === selected.id) });
  };
  const upload = useUploadStore((s) => s.uploads[messageId]);
  // 16 padding each side, 40 avatar and a 12 gap.
  const available = width - 16 * 2 - 40 - 12;
  return (
    <View style={styles.wrap}>
      {media.length > 0 && <MediaGrid media={media} width={available} onOpen={openMedia} />}
      {files.map((file) => <FileSpoiler key={file.id} attachment={file}>{previewKind(file) === 'audio' ? <AudioRow attachment={file} /> : <FileRow attachment={file} />}</FileSpoiler>)}
      {sending && upload && (
        <View style={styles.progress}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round((upload.total > 0 ? upload.loaded / upload.total : 0) * 100)}%` }]} />
          </View>
          <Text style={styles.progressText}>{uploadLabel(upload)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel upload" onPress={upload.abort} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      )}
      <MediaViewer items={viewing?.items ?? []} index={viewing?.index ?? null} onClose={() => setViewing(null)} />
    </View>
  );
}

function FileSpoiler({ attachment, children }: { attachment: Attachment; children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  if (!isSpoiler(attachment) || revealed) return children;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Spoiler file, tap to reveal" onPress={() => setRevealed(true)} style={styles.file}>
      <Ionicons name="eye-off-outline" size={24} color={theme.muted} />
      <Text style={styles.coverText}>SPOILER</Text>
    </Pressable>
  );
}

function MediaGrid({ media, width, onOpen }: { media: Attachment[]; width: number; onOpen(index: number): void }) {
  if (media.length === 1) {
    const size = singleMediaSize(media[0]!, width);
    return <Tile attachment={media[0]!} style={size} onPress={() => onOpen(0)} />;
  }
  const { rows, shown, hidden, tallFirst } = tileRows(media.length);
  const gridWidth = Math.min(width, 320);
  if (tallFirst) {
    const h = rows[0]!.height;
    return (
      <View style={[styles.row, { width: gridWidth, height: h }]}>
        <Tile attachment={media[0]!} style={styles.fill1} onPress={() => onOpen(0)} />
        <View style={styles.column}>
          <Tile attachment={media[1]!} style={styles.fill1} onPress={() => onOpen(1)} />
          <Tile attachment={media[2]!} style={styles.fill1} onPress={() => onOpen(2)} />
        </View>
      </View>
    );
  }
  let at = 0;
  return (
    <View style={{ width: gridWidth, gap: 2 }}>
      {rows.map((row, r) => (
        <View key={r} style={[styles.row, { height: row.height }]}>
          {row.spans.map((span, c) => {
            const index = at++;
            const last = index === shown - 1;
            return <Tile key={c} attachment={media[index]!} style={{ flex: span }} more={last ? hidden : 0} onPress={() => onOpen(index)} />;
          })}
        </View>
      ))}
    </View>
  );
}

function Tile({ attachment, style, more = 0, onPress }: { attachment: Attachment; style: object; more?: number; onPress(): void }) {
  const [revealed, setRevealed] = useState(false);
  const video = previewKind(attachment) === 'video';
  const hidden = isSpoiler(attachment) && !revealed;
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={hidden ? 'Spoiler image, tap to reveal' : attachment.description || displayFilename(attachment.filename)}
      onPress={hidden ? () => setRevealed(true) : onPress}
      style={[styles.tile, style]}
    >
      {video ? (
        <View style={styles.videoPoster}>
          <Ionicons name="play-circle" size={48} color={theme.text} />
          <Text numberOfLines={1} style={styles.posterName}>
            {displayFilename(attachment.filename)}
          </Text>
        </View>
      ) : (
        <Image source={{ uri: attachment.url }} contentFit="cover" blurRadius={hidden ? 40 : 0} style={styles.image} />
      )}
      {hidden && (
        <View style={styles.cover}>
          <Text style={styles.coverText}>SPOILER</Text>
        </View>
      )}
      {more > 0 && (
        <View style={styles.cover}>
          <Text style={styles.moreText}>{`+${more}`}</Text>
        </View>
      )}
    </Pressable>
  );
}

function FileRow({ attachment }: { attachment: Attachment }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${displayFilename(attachment.filename)}`} onPress={() => openLink(attachment.url)} style={styles.file}>
      <Ionicons name="document-outline" size={26} color={theme.muted} />
      <View style={styles.fileText}>
        <Text numberOfLines={1} style={styles.fileName}>
          {displayFilename(attachment.filename)}
        </Text>
        <Text style={styles.fileSize}>{formatBytes(attachment.size)}</Text>
      </View>
    </Pressable>
  );
}

/** Audio plays through a player that is only created when the row is first tapped, so a long chat does not hold dozens of players. */
function AudioRow({ attachment }: { attachment: Attachment }) {
  const [started, setStarted] = useState(false);
  if (!started) return <AudioShell attachment={attachment} playing={false} onToggle={() => setStarted(true)} />;
  return <ActiveAudio attachment={attachment} />;
}

function ActiveAudio({ attachment }: { attachment: Attachment }) {
  const player = useAudioPlayer({ uri: attachment.url });
  const status = useAudioPlayerStatus(player);
  const [auto, setAuto] = useState(true);
  const [speed, setSpeed] = useState(1);
  if (auto && status.isLoaded) {
    setAuto(false);
    player.play();
  }
  return <AudioShell attachment={attachment} playing={status.playing} onToggle={() => (status.playing ? player.pause() : player.play())} speed={speed} onSpeed={() => { const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1; player.setPlaybackRate(next); setSpeed(next); }} />;
}

function AudioShell({ attachment, playing, onToggle, speed, onSpeed }: { attachment: Attachment; playing: boolean; onToggle(): void; speed?: number; onSpeed?(): void }) {
  let samples: number[] = [];
  try { samples = [...atob(attachment.waveform ?? '')].slice(0, 64).map((c) => c.charCodeAt(0)); } catch { /* untrusted metadata */ }
  return (
    <View style={styles.file}>
      <Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play'} onPress={onToggle} style={styles.play}>
        <Ionicons name={playing ? 'pause' : 'play'} size={22} color={theme.accentText} />
      </Pressable>
      <View style={styles.fileText}>
        <Text numberOfLines={1} style={styles.fileName}>{attachment.waveform ? 'Voice message' : displayFilename(attachment.filename)}</Text>
        {samples.length > 0 && <View accessibilityLabel="Recording waveform" style={styles.wave}>{samples.map((sample, i) => <View key={i} style={{ width: 2, height: Math.max(2, sample / 12), backgroundColor: theme.accent }} />)}</View>}
        <Text style={styles.fileSize}>{attachment.duration_secs ? `${Math.ceil(attachment.duration_secs)}s` : formatBytes(attachment.size)}</Text>
      </View>
      {attachment.waveform && onSpeed && <Pressable accessibilityRole="button" accessibilityLabel={`Playback speed ${speed} times`} onPress={onSpeed}><Text style={styles.fileName}>{speed}×</Text></Pressable>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4, gap: 6 },
  row: { flexDirection: 'row', gap: 2 },
  column: { flex: 1, gap: 2 },
  fill1: { flex: 1 },
  tile: { borderRadius: 10, overflow: 'hidden', backgroundColor: theme.raised },
  image: { width: '100%', height: '100%' },
  videoPoster: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.raisedHover, gap: 4, padding: 8 },
  posterName: { color: theme.muted, fontSize: 12, maxWidth: '90%' },
  cover: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  coverText: { color: theme.text, fontWeight: '700', letterSpacing: 1 },
  moreText: { color: theme.text, fontSize: 26, fontWeight: '700' },
  file: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 12, borderRadius: 10, backgroundColor: theme.raised, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairlineStrong, maxWidth: 320 },
  fileText: { flex: 1 },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 1, height: 24, overflow: 'hidden' },
  fileName: { color: theme.accent, fontSize: 15 },
  fileSize: { color: theme.subtle, fontSize: 12 },
  play: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  track: { flexBasis: '100%', height: 4, borderRadius: 2, backgroundColor: theme.hairlineStrong, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: theme.accent },
  progressText: { color: theme.muted, fontSize: 12 },
  cancel: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  cancelText: { color: theme.accent, fontSize: 13, fontWeight: '600' },
});
