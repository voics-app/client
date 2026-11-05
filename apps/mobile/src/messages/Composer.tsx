import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { charsRemaining, showCounter } from '@discordy/core/domain/composerLimits';
import { theme } from '../theme';

export type ComposerMode = { kind: 'compose' } | { kind: 'reply'; messageId: string; authorName: string } | { kind: 'edit'; messageId: string; content: string };

export const ATTACHMENTS_NOTICE = "Attachments aren't in this test version yet.";

export interface ComposerProps {
  mode: ComposerMode;
  /** Why the user cannot write here; replaces the input when set. */
  blockedReason: string | null;
  /** Hint inside the empty input, e.g. `Message #general`. */
  placeholder: string;
  onSubmit(text: string, mode: ComposerMode): void;
  onCancelMode(): void;
}

export function Composer({ mode, blockedReason, placeholder, onSubmit, onCancelMode }: ComposerProps) {
  const [text, setText] = useState('');
  const [multiline, setMultiline] = useState(false);
  useEffect(() => {
    setText(mode.kind === 'edit' ? mode.content : '');
  }, [mode]);

  if (blockedReason) {
    return (
      <View style={styles.blocked}>
        <Text style={styles.blockedText}>{blockedReason}</Text>
      </View>
    );
  }

  const remaining = charsRemaining(text);
  const canSubmit = text.trim() !== '' && remaining >= 0;
  const submit = () => {
    if (!canSubmit) return;
    onSubmit(text.trim(), mode);
    setText('');
  };

  return (
    <View style={styles.wrap}>
      {mode.kind !== 'compose' && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{mode.kind === 'reply' ? `Replying to ${mode.authorName}` : 'Editing message'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onCancelMode}>
            <Text style={styles.bannerAction}>Cancel</Text>
          </Pressable>
        </View>
      )}
      <View style={[styles.field, multiline ? styles.fieldGrown : styles.fieldSingle]}>
        {mode.kind === 'compose' && (
          <Pressable accessibilityRole="button" accessibilityLabel="Add attachment" hitSlop={6} onPress={() => Alert.alert('Attachments', ATTACHMENTS_NOTICE)} style={styles.plus}>
            <Ionicons name="add" size={26} color={theme.muted} />
          </Pressable>
        )}
        <TextInput accessibilityLabel="Message" style={styles.input} value={text} onChangeText={setText} placeholder={placeholder} placeholderTextColor={theme.subtle} multiline onContentSizeChange={(e) => setMultiline(isMultiline(e.nativeEvent.contentSize.height))} />
        {canSubmit && (
          <Pressable accessibilityRole="button" accessibilityLabel={mode.kind === 'edit' ? 'Save edit' : 'Send'} onPress={submit} style={styles.send}>
            <Ionicons name={mode.kind === 'edit' ? 'checkmark' : 'arrow-up'} size={20} color={theme.accentText} />
          </Pressable>
        )}
      </View>
      {showCounter(remaining) && <Text style={[styles.counter, remaining < 0 && styles.over]}>{remaining}</Text>}
    </View>
  );
}

/** The input is one line while its content is shorter than two lines; then the plus and send buttons centre on it, and from two lines they stick to the bottom. */
export const isMultiline = (contentHeight: number): boolean => contentHeight > LINE_HEIGHT * 1.5;
const LINE_HEIGHT = 21;

const SIZE = 44;
/** Plus, send and one line of input share this height, so a single-line field centres all three on one line. */
const BUTTON = 40;

const styles = StyleSheet.create({
  wrap: { backgroundColor: theme.surface, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, borderTopWidth: 1, borderTopColor: theme.hairline },
  banner: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8, paddingHorizontal: 6 },
  bannerText: { color: theme.muted, fontSize: 13 },
  bannerAction: { color: theme.accent, fontSize: 13, fontWeight: '600' },
  field: {
    flexDirection: 'row',
    backgroundColor: theme.raised,
    borderRadius: SIZE / 2 + 2,
    borderWidth: 1,
    borderColor: theme.hairlineStrong,
    paddingHorizontal: 5,
    paddingVertical: 4,
    minHeight: SIZE + 4,
  },
  fieldSingle: { alignItems: 'center' },
  fieldGrown: { alignItems: 'flex-end' },
  plus: { width: BUTTON, height: BUTTON, borderRadius: BUTTON / 2, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, color: theme.text, fontSize: 16, lineHeight: LINE_HEIGHT, textAlignVertical: 'center', paddingHorizontal: 8, paddingTop: 9.5, paddingBottom: 9.5, minHeight: BUTTON, maxHeight: 132 },
  send: { width: BUTTON, height: BUTTON, borderRadius: BUTTON / 2, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
  counter: { color: theme.muted, fontSize: 12, alignSelf: 'flex-end', paddingTop: 4 },
  over: { color: theme.danger },
  blocked: { backgroundColor: theme.surface, padding: 18 },
  blockedText: { color: theme.muted, textAlign: 'center' },
});
