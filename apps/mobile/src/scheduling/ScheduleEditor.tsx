import { createI18n } from '@discordy/core/domain/i18n';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useChannelContentAccess } from '../safety/useChannelContentAccess';
import { AgeRestrictedNotice } from '../safety/AgeRestrictedNotice';
import { canShowChannelContent } from '@discordy/core/application/ageRestrictedAccess';
import { useEffect } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { localScheduleInput, scheduleTimeLabel } from '@discordy/core/domain/scheduledMessages';
import { useScheduledMessageEditor, type ScheduleEditorOptions } from '@discordy/react/useScheduledMessageEditor';
import { space, theme, type } from '../theme';
import { Button, Field } from '../ui/controls';

/** Existing native sheet controls, explicit local calendar fields, one scheduling action. */
export function ScheduleEditor({ options, onBack, onBusy }: { options: ScheduleEditorOptions; onBack(): void; onBusy(busy: boolean): void }) {
  const locale = useSessionStore((state) => state.settings.locale);
  const { t } = createI18n(locale);
  const contentAllowed = useChannelContentAccess().canShow(options.channelId);
  const form = useScheduledMessageEditor({ ...options, contentAllowed, canAccessContent: () => canShowChannelContent(options.channelId) });
  useEffect(() => { onBusy(form.busy); return () => onBusy(false); }, [form.busy, onBusy]);
  if (!contentAllowed) return <><AgeRestrictedNotice channelId={options.channelId} inline /><Button label={t('age.backSchedules')} disabled={form.busy} onPress={onBack} /></>;
  const [date = '', time = ''] = form.localTime.split('T');
  const tomorrow = () => { const next = new Date(); next.setDate(next.getDate() + 1); next.setHours(9, 0, 0, 0); form.setLocalTime(localScheduleInput(next.getTime())); };
  return <View style={styles.form}>
    {form.pending && <Text accessibilityRole="alert" style={styles.help}>A previous request is waiting for confirmation. Retry checks the same request; it does not schedule another copy. Your composer draft stays here until confirmation.</Text>}
    <Field label="Message" value={form.message.content} multiline maxLength={4000} editable={!form.fieldsDisabled} onChangeText={(content) => form.setMessage({ ...form.message, content })} />
    <View style={styles.shortcuts}><Button label="In 1 hour" disabled={form.fieldsDisabled} onPress={() => form.setLocalTime(localScheduleInput(Date.now() + 3_600_000))} /><Button label="Tomorrow at 09:00" disabled={form.fieldsDisabled} onPress={tomorrow} /></View>
    <Field label="Date (YYYY-MM-DD)" value={date} placeholder="YYYY-MM-DD" editable={!form.fieldsDisabled} onChangeText={(next) => form.setLocalTime(`${next}T${time}`)} />
    <Field label="Time (HH:MM, 24-hour)" value={time} placeholder="HH:MM" editable={!form.fieldsDisabled} onChangeText={(next) => form.setLocalTime(`${date}T${next}`)} />
    <Text style={styles.help}>Local time · {Intl.DateTimeFormat().resolvedOptions().timeZone}. Choose between one minute and 30 days from now.</Text>
    {form.instant && <Text style={styles.time}>{scheduleTimeLabel(form.instant)}</Text>}
    <View style={styles.option}><Text style={styles.optionLabel}>Send without notifications</Text><Switch accessibilityLabel="Send without notifications" value={form.message.silent ?? false} disabled={form.fieldsDisabled} onValueChange={(silent) => form.setMessage({ ...form.message, silent })} trackColor={{ true: theme.accent }} /></View>
    <View style={styles.option}><Text style={styles.optionLabel}>Text-to-speech</Text><Switch accessibilityLabel="Text-to-speech" value={form.message.tts ?? false} disabled={form.fieldsDisabled || !options.canTts} onValueChange={(tts) => form.setMessage({ ...form.message, tts })} trackColor={{ true: theme.accent }} /></View>
    {form.message.reply_to && <><View style={styles.option}><Text style={styles.optionLabel}>Mention the person I am replying to</Text><Switch accessibilityLabel="Mention the person I am replying to" value={form.message.replied_user ?? true} disabled={form.fieldsDisabled} onValueChange={(replied_user) => form.setMessage({ ...form.message, replied_user })} trackColor={{ true: theme.accent }} /></View><Button label="Remove reply" disabled={form.fieldsDisabled} onPress={() => form.setMessage({ ...form.message, reply_to: null })} /></>}
    {form.validation && <Text accessibilityRole="alert" style={styles.error}>{form.validation}</Text>}
    {form.error && <Text accessibilityRole="alert" style={styles.error}>{form.error}</Text>}
    {form.conflict && <View style={styles.conflict}><Text accessibilityRole="header" style={styles.heading}>Latest version</Text><Text style={styles.help}>{scheduleTimeLabel(form.conflict.scheduled_at)}</Text><Text style={styles.message}>{form.conflict.message?.content ?? 'The message text has been cleared after completion.'}</Text>{form.conflict.status === 'pending' && <Button label="Load latest version" onPress={form.useLatest} />}</View>}
    <Text style={styles.help}>The server sends this while your devices are offline. Service interruptions can delay delivery.</Text>
    <Button label={form.pending ? options.mode === 'standard' ? 'Retry confirmation' : 'Check confirmation' : form.isEditing ? 'Save changes' : 'Schedule message'} size="large" tone="primary" busy={form.busy} disabled={!form.canSave} onPress={() => void form.save()} />
    <Button label="Back" disabled={form.busy} onPress={onBack} />
  </View>;
}

const styles = StyleSheet.create({
  form: { gap: space[4], paddingHorizontal: space[5], paddingBottom: space[4] },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  help: { color: theme.muted, fontSize: type.ui, lineHeight: 21 },
  time: { color: theme.text, fontSize: type.body, fontVariant: ['tabular-nums'] },
  option: { flexDirection: 'row', alignItems: 'center', gap: space[4], minHeight: 48 },
  optionLabel: { flex: 1, color: theme.text, fontSize: type.body },
  error: { color: theme.danger, fontSize: type.ui, lineHeight: 21 },
  conflict: { gap: space[2], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline, paddingTop: space[4] },
  heading: { color: theme.text, fontSize: type.body, fontWeight: '600' },
  message: { color: theme.text, fontSize: type.body },
});
