import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { errorMessage } from '@discordy/core/application/errorMessage';
import { BottomSheet } from '../sheets/BottomSheet';
import { theme } from '../theme';
import { pickDocuments, pickFromLibrary, takePhoto } from './attachmentPicker';
import type { OutgoingFile } from './outgoingFile';

/** The + button's sheet: photo library, camera and files. Picked files go to `onPicked`; the sheet closes first so the picker opens over the chat. */
export function AttachMenu({ visible, onClose, onPicked }: { visible: boolean; onClose(): void; onPicked(files: OutgoingFile[]): void }) {
  const run = (pick: () => Promise<OutgoingFile[] | null>) => async () => {
    onClose();
    try {
      const files = await pick();
      if (files === null) Alert.alert('Camera', 'Allow camera access in Settings to take photos.');
      else if (files.length > 0) onPicked(files);
    } catch (e) {
      Alert.alert('Could not add the file', errorMessage(e));
    }
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} label="Add attachment">
      <Option icon="images-outline" label="Photo library" onPress={run(pickFromLibrary)} />
      <Option icon="camera-outline" label="Take photo or video" onPress={run(takePhoto)} />
      <Option icon="document-outline" label="Files" onPress={run(pickDocuments)} />
    </BottomSheet>
  );
}

function Option({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
      <Ionicons name={icon} size={22} color={theme.muted} />
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, minHeight: 52 },
  pressed: { backgroundColor: theme.hover },
  text: { color: theme.text, fontSize: 16 },
});
