import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { quickApiForm, quickReactions } from '@discordy/core/domain/quickReactions';
import type { MessageActions } from './messageAccess';
import { theme } from '../theme';

export interface MessageActionSheetProps {
  /** The actions allowed on the long-pressed message; null closes the sheet. */
  actions: MessageActions | null;
  onReact(emoji: string): void;
  onReply(): void;
  onEdit(): void;
  onDelete(): void;
  onClose(): void;
}

const QUICK = quickReactions([]);

/** Bottom sheet with only the actions the user may take on one message. */
export function MessageActionSheet({ actions, onReact, onReply, onEdit, onDelete, onClose }: MessageActionSheetProps) {
  return (
    <Modal visible={actions !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close actions" />
      {actions && (
        <View style={styles.sheet}>
          {actions.react && (
            <View style={styles.quick}>
              {QUICK.map((e) => (
                <Pressable key={quickApiForm(e)} accessibilityRole="button" accessibilityLabel={`React with ${e.name}`} onPress={() => onReact(quickApiForm(e))} style={styles.emoji}>
                  <Text style={styles.emojiText}>{e.name}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {actions.reply && <Option label="Reply" onPress={onReply} />}
          {actions.edit && <Option label="Edit" onPress={onEdit} />}
          {actions.delete && <Option label="Delete" danger onPress={onDelete} />}
          <Option label="Cancel" onPress={onClose} />
        </View>
      )}
    </Modal>
  );
}

function Option({ label, danger, onPress }: { label: string; danger?: boolean; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.option}>
      <Text style={[styles.optionText, danger && styles.danger]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000088' },
  sheet: { backgroundColor: theme.surface, paddingBottom: 24, paddingTop: 8 },
  quick: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8 },
  emoji: { padding: 8 },
  emojiText: { fontSize: 28 },
  option: { paddingHorizontal: 20, paddingVertical: 14 },
  optionText: { color: theme.text, fontSize: 16 },
  danger: { color: theme.danger },
});
