import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatBytes, previewKind } from '@discordy/core/domain/media';
import { theme } from '../theme';
import type { OutgoingFile } from './outgoingFile';

/** The files chosen for the next message, as a row of previews with a remove button on each. */
export function PendingFiles({ files, onRemove }: { files: readonly OutgoingFile[]; onRemove(index: number): void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
      {files.map((file, i) => {
        const kind = previewKind({ filename: file.name, content_type: file.mimeType, size: file.size });
        return (
          <View key={`${file.uri}:${i}`} style={styles.tile}>
            {kind === 'image' ? (
              <Image accessibilityLabel={`Preview of ${file.name}`} source={{ uri: file.uri }} style={styles.image} />
            ) : (
              <View style={styles.file}>
                <Ionicons name={kind === 'video' ? 'videocam-outline' : kind === 'audio' ? 'musical-notes-outline' : 'document-outline'} size={24} color={theme.muted} />
                <Text numberOfLines={1} style={styles.name}>
                  {file.name}
                </Text>
                {file.size > 0 && <Text style={styles.size}>{formatBytes(file.size)}</Text>}
              </View>
            )}
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${file.name}`} hitSlop={12} onPress={() => onRemove(i)} style={styles.remove}>
              <Ionicons name="close" size={14} color={theme.accentText} />
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingBottom: 10, paddingTop: 8, paddingHorizontal: 6 },
  tile: { width: 88, height: 88, borderRadius: 12, backgroundColor: theme.raised },
  image: { width: 88, height: 88, borderRadius: 12 },
  file: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 6, gap: 2 },
  name: { color: theme.text, fontSize: 11, maxWidth: 76 },
  size: { color: theme.subtle, fontSize: 10 },
  remove: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: theme.danger, alignItems: 'center', justifyContent: 'center' },
});
