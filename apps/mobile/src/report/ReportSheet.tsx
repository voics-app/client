import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { submitReport } from '@discordy/core/application/reportCommands';
import {
  REPORT_CATEGORIES,
  REPORT_CONFIRMATION,
  REPORT_NOTE_MAX,
  canIncludeContent,
  canSubmitReport,
  emptyReportDraft,
  reportDisclosure,
  reportTitle,
  type ReportDraft,
  type ReportTarget,
} from '@discordy/core/domain/reportModel';
import { getRuntime } from '../runtime';
import { useLastValue } from '../sheets/useLastValue';
import { theme } from '../theme';
import { Button, Field } from '../ui/controls';
import { Sheet } from '../ui/Sheet';

/** Report a message or a user: pick what is wrong, add an optional note, see what is shared, send. Same rules and wording as desktop (core `reportModel`). */
export function ReportSheet({ target: shown, onClose }: { target: ReportTarget | null; onClose(): void }) {
  const target = useLastValue(shown);
  const [draft, setDraft] = useState<ReportDraft>(emptyReportDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Each report starts from a clean draft.
  useEffect(() => {
    if (shown) {
      setDraft(emptyReportDraft());
      setError(null);
      setSent(false);
    }
  }, [shown]);

  const send = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    const outcome = await submitReport(getRuntime().api, target, draft);
    setBusy(false);
    if (outcome.ok) setSent(true);
    else setError(outcome.message);
  };

  return (
    <Sheet visible={shown !== null} title={sent ? REPORT_CONFIRMATION.title : target ? reportTitle(target) : 'Report'} closeLabel="Close report" onClose={onClose}>
      {target && sent && (
        <View style={styles.body}>
          <Text style={styles.text}>{REPORT_CONFIRMATION.body}</Text>
          <Button label="Done" tone="primary" onPress={onClose} />
        </View>
      )}
      {target && !sent && (
        <View style={styles.body}>
          <Text style={styles.text}>{reportDisclosure(target)}</Text>
          <Text accessibilityRole="header" style={styles.heading}>
            What is wrong?
          </Text>
          {REPORT_CATEGORIES.map((c) => {
            const on = draft.category === c.id;
            return (
              <Pressable
                key={c.id}
                accessibilityRole="radio"
                accessibilityLabel={c.label}
                accessibilityHint={c.hint}
                accessibilityState={{ selected: on }}
                onPress={() => setDraft({ ...draft, category: c.id })}
                style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
              >
                <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? theme.accent : theme.muted} />
                <View style={styles.choiceCopy}>
                  <Text style={styles.choiceLabel}>{c.label}</Text>
                  <Text style={styles.choiceHint}>{c.hint}</Text>
                </View>
              </Pressable>
            );
          })}
          <Field label="Note (optional)" value={draft.note} onChangeText={(note) => setDraft({ ...draft, note })} maxLength={REPORT_NOTE_MAX} multiline placeholder="Anything that helps the moderators" autoCapitalize="sentences" />
          {canIncludeContent(target) && (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel="Send the text of this message with the report"
              accessibilityState={{ checked: draft.includeContent }}
              onPress={() => setDraft({ ...draft, includeContent: !draft.includeContent })}
              style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
            >
              <Ionicons name={draft.includeContent ? 'checkbox' : 'square-outline'} size={22} color={draft.includeContent ? theme.accent : theme.muted} />
              <Text style={[styles.choiceLabel, styles.choiceCopy]}>Send the text of this message with the report</Text>
            </Pressable>
          )}
          {error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
          <View style={styles.actions}>
            <Button label="Send report" tone="danger" busy={busy} disabled={!canSubmitReport(draft)} onPress={() => void send()} />
            <Button label="Cancel" onPress={onClose} />
          </View>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 12, gap: 4 },
  text: { color: theme.muted, fontSize: 15, marginBottom: 8 },
  heading: { color: theme.text, fontSize: 16, fontWeight: '700', marginTop: 4, marginBottom: 4 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 4 },
  pressed: { backgroundColor: theme.hover },
  choiceCopy: { flex: 1 },
  choiceLabel: { color: theme.text, fontSize: 16 },
  choiceHint: { color: theme.muted, fontSize: 13 },
  error: { color: theme.danger, fontSize: 14, marginTop: 8 },
  actions: { gap: 8, marginTop: 12 },
});
