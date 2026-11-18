import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { quickApiForm, quickReactions } from '@discordy/core/domain/quickReactions';
import type { MessageActions } from './messageAccess';
import { BottomSheet } from '../sheets/BottomSheet';
import { useLastValue } from '../sheets/useLastValue';
import { theme } from '../theme';

export interface MessageActionSheetProps {
  /** The actions allowed on the long-pressed message; null closes the sheet. */
  actions: MessageActions | null;
  onReact(emoji: string): void;
  onReply(): void;
  onCreateThread(): void;
  onEdit(): void;
  onEditAttachments(): void;
  onDelete(): void;
  onMoreReactions(): void;
  onCopyText(): void;
  onCopyLink(): void;
  onMarkUnread(): void;
  onPin(): void;
  onSelectText(): void;
  onBlock(): void;
  onForward(): void;
  onReport(): void;
  onClose(): void;
}

const QUICK = quickReactions([]);

/** Bottom sheet with only the actions the user may take on one message. */
export function MessageActionSheet({ actions: current, onReact, onMoreReactions, onReply, onCreateThread, onEdit, onEditAttachments, onDelete, onCopyText, onCopyLink, onMarkUnread, onPin, onSelectText, onBlock, onForward, onReport, onClose }: MessageActionSheetProps) {
  const actions = useLastValue(current);
  return (
    <BottomSheet visible={current !== null} onClose={onClose} label="Message actions">
      {actions && (
        <View>
          {actions.react && (
            <View style={styles.quick}>
              {QUICK.map((e) => (
                <Pressable key={quickApiForm(e)} accessibilityRole="button" accessibilityLabel={`React with ${e.name}`} onPress={() => onReact(quickApiForm(e))} style={styles.emoji}>
                  <Text style={styles.emojiText}>{e.name}</Text>
                </Pressable>
              ))}
              <Pressable accessibilityRole="button" accessibilityLabel="More reactions" onPress={onMoreReactions} style={styles.emoji}>
                <Ionicons name="happy-outline" size={28} color={theme.muted} />
              </Pressable>
            </View>
          )}
          {actions.reply && <Option icon="arrow-undo-outline" label="Reply" onPress={onReply} />}
          {actions.thread && <Option icon="chatbubbles-outline" label="Create Thread" onPress={onCreateThread} />}
          {actions.copyText && <Option icon="copy-outline" label="Copy Text" onPress={onCopyText} />}
          {actions.copyText && <Option icon="text-outline" label="Select Text" onPress={onSelectText} />}
          {actions.forward && <Option icon="arrow-redo-outline" label="Forward" onPress={onForward} />}
          {actions.copyLink && <Option icon="link-outline" label="Copy Message Link" onPress={onCopyLink} />}
          {actions.markUnread && <Option icon="mail-unread-outline" label="Mark Unread" onPress={onMarkUnread} />}
          {(actions.pin || actions.unpin) && <Option icon="pin-outline" label={actions.unpin ? 'Unpin Message' : 'Pin Message'} onPress={onPin} />}
          {actions.edit && <Option icon="create-outline" label="Edit" onPress={onEdit} />}
          {actions.editAttachments && <Option icon="attach-outline" label="Edit Attachments" onPress={onEditAttachments} />}
          {actions.delete && <Option icon="trash-outline" label="Delete" danger onPress={onDelete} />}
          {actions.blockAuthor && <Option icon="ban-outline" label="Block User" danger onPress={onBlock} />}
          {actions.report && <Option icon="flag-outline" label="Report Message" danger onPress={onReport} />}
        </View>
      )}
    </BottomSheet>
  );
}

function Option({ icon, label, danger, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; danger?: boolean; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
      <Ionicons name={icon} size={22} color={danger ? theme.danger : theme.muted} />
      <Text style={[styles.optionText, danger && styles.danger]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  quick: { flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 8, paddingHorizontal: 8 },
  emoji: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: 28 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, minHeight: 48 },
  pressed: { backgroundColor: theme.hover },
  optionText: { color: theme.text, fontSize: 16 },
  danger: { color: theme.danger },
});
