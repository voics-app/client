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
import { createI18n } from '@discordy/core/domain/i18n';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';

/** Report a message or a user: pick what is wrong, add an optional note, see what is shared, send. Same rules and wording as desktop (core `reportModel`). */
export function ReportSheet({ target: shown, onClose }: { target: ReportTarget | null; onClose(): void }) {
  const locale = useSessionStore((s) => s.settings.locale);
  const { t, catalogText } = createI18n(locale);
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
    const outcome = await submitReport(getRuntime().api, target, draft, locale);
    setBusy(false);
    if (outcome.ok) setSent(true);
    else setError(outcome.message);
  };

  return (
    <Sheet visible={shown !== null} title={sent ? catalogText(REPORT_CONFIRMATION.title) : target ? reportTitle(target, locale) : catalogText('Report')} closeLabel={t('report.close')} onClose={onClose}>
      {target && sent && (
        <View style={styles.body}>
          <Text style={styles.text}>{target.kind === 'channel' ? t('report.channelSentBody') : catalogText(REPORT_CONFIRMATION.body)}</Text>
          <Button label={t('common.done')} tone="primary" onPress={onClose} />
        </View>
      )}
      {target && !sent && (
        <View style={styles.body}>
          <Text style={styles.text}>{reportDisclosure(target, locale)}</Text>
          <Text accessibilityRole="header" style={styles.heading}>
            {t('settings.reportdialog.what.is.wrong')}
          </Text>
          {REPORT_CATEGORIES.map((c) => {
            const on = draft.category === c.id;
            return (
              <Pressable
                key={c.id}
                accessibilityRole="radio"
                accessibilityLabel={catalogText(c.label)}
                accessibilityHint={catalogText(c.hint)}
                accessibilityState={{ selected: on }}
                onPress={() => setDraft({ ...draft, category: c.id })}
                style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
              >
                <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? theme.accent : theme.muted} />
                <View style={styles.choiceCopy}>
                  <Text style={styles.choiceLabel}>{catalogText(c.label)}</Text>
                  <Text style={styles.choiceHint}>{catalogText(c.hint)}</Text>
                </View>
              </Pressable>
            );
          })}
          <Field label={t('settings.reportdialog.note.optional')} value={draft.note} onChangeText={(note) => setDraft({ ...draft, note })} maxLength={REPORT_NOTE_MAX} multiline placeholder={t('report.notePlaceholder')} autoCapitalize="sentences" />
          {canIncludeContent(target) && (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={t('settings.reportdialog.send.the.text.of.this.message.with.the.report')}
              accessibilityState={{ checked: draft.includeContent }}
              onPress={() => setDraft({ ...draft, includeContent: !draft.includeContent })}
              style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
            >
              <Ionicons name={draft.includeContent ? 'checkbox' : 'square-outline'} size={22} color={draft.includeContent ? theme.accent : theme.muted} />
              <Text style={[styles.choiceLabel, styles.choiceCopy]}>{t('settings.reportdialog.send.the.text.of.this.message.with.the.report')}</Text>
            </Pressable>
          )}
          {error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
          <View style={styles.actions}>
            <Button label={t('settings.reportdialog.send.report')} tone="danger" busy={busy} disabled={!canSubmitReport(draft)} onPress={() => void send()} />
            <Button label={t('common.cancel')} onPress={onClose} />
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
