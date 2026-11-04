import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { charsRemaining, showCounter } from '@discordy/core/domain/composerLimits';
import { theme } from '../theme';

export type ComposerMode = { kind: 'compose' } | { kind: 'reply'; messageId: string; authorName: string } | { kind: 'edit'; messageId: string; content: string };

export interface ComposerProps {
  mode: ComposerMode;
  /** Why the user cannot write here; replaces the input when set. */
  blockedReason: string | null;
  onSubmit(text: string, mode: ComposerMode): void;
  onCancelMode(): void;
}

export function Composer({ mode, blockedReason, onSubmit, onCancelMode }: ComposerProps) {
  const [text, setText] = useState('');
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
      <View style={styles.inputRow}>
        <TextInput
          accessibilityLabel="Message"
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Message"
          placeholderTextColor={theme.muted}
          multiline
        />
        <Pressable accessibilityRole="button" accessibilityLabel={mode.kind === 'edit' ? 'Save edit' : 'Send'} disabled={!canSubmit} onPress={submit} style={[styles.send, !canSubmit && styles.sendOff]}>
          <Text style={styles.sendText}>{mode.kind === 'edit' ? 'Save' : 'Send'}</Text>
        </Pressable>
      </View>
      {showCounter(remaining) && <Text style={[styles.counter, remaining < 0 && styles.over]}>{remaining}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: theme.surface, paddingHorizontal: 10, paddingVertical: 8 },
  banner: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 6 },
  bannerText: { color: theme.muted, fontSize: 12 },
  bannerAction: { color: theme.accent, fontSize: 12, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, color: theme.text, backgroundColor: theme.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, maxHeight: 120, fontSize: 15 },
  send: { backgroundColor: theme.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  sendOff: { opacity: 0.4 },
  sendText: { color: '#ffffff', fontWeight: '700' },
  counter: { color: theme.muted, fontSize: 11, alignSelf: 'flex-end', paddingTop: 4 },
  over: { color: theme.danger },
  blocked: { backgroundColor: theme.surface, padding: 14 },
  blockedText: { color: theme.muted, textAlign: 'center' },
});
