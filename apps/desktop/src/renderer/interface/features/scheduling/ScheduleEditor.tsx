import { useI18n } from '../../shared/i18n';
import { useChannelContentAccess } from '../../shared/hooks/useChannelContentAccess';
import { AgeRestrictedNotice } from '../channels/AgeRestrictedNotice';
import { canShowChannelContent } from '@discordy/core/application/ageRestrictedAccess';
import { useEffect } from 'react';
import { scheduleTimeLabel } from '@discordy/core/domain/scheduledMessages';
import { useScheduledMessageEditor, type ScheduleEditorOptions } from '@discordy/react/useScheduledMessageEditor';
import { Button } from '../../shared/ui/Button';
import { Field, Input, TextArea } from '../../shared/ui/Form';

/** Nightglass composer extension: message, exact local time, then one explicit commit. */
export function ScheduleEditor({ options, onBack, onBusy }: { options: ScheduleEditorOptions; onBack(): void; onBusy(busy: boolean): void }) {
  const { t } = useI18n();
  const contentAllowed = useChannelContentAccess().canShow(options.channelId);
  const form = useScheduledMessageEditor({ ...options, contentAllowed, canAccessContent: () => canShowChannelContent(options.channelId) });
  useEffect(() => { onBusy(form.busy); return () => onBusy(false); }, [form.busy, onBusy]);
  if (!contentAllowed) return <><AgeRestrictedNotice channelId={options.channelId} inline /><Button disabled={form.busy} onClick={onBack}>{t('age.backSchedules')}</Button></>;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return <form className="schedule-form" onSubmit={(event) => { event.preventDefault(); void form.save(); }}>
    {form.pending && <p className="schedule-notice" role="status">A previous request is waiting for confirmation. Retry checks the same request; it does not schedule another copy. Your composer draft stays here until confirmation.</p>}
    <Field label="Message">{(id) => <TextArea id={id} autoFocus={!form.fieldsDisabled} data-autofocus={form.fieldsDisabled ? undefined : ''} value={form.message.content} rows={4} maxLength={4000} disabled={form.busy || form.pending !== null} readOnly={form.conflict !== null} onChange={(event) => { if (!form.fieldsDisabled) form.setMessage({ ...form.message, content: event.target.value }); }} />}</Field>
    <Field label="Send on" hint={`Local time · ${zone}. Choose between one minute and 30 days from now.`}>{(id) => <Input id={id} type="datetime-local" value={form.localTime} disabled={form.fieldsDisabled} onChange={(event) => form.setLocalTime(event.target.value)} />}</Field>
    {form.instant && <p className="schedule-time" role="status">{scheduleTimeLabel(form.instant)}</p>}
    <div className="schedule-options">
      <label className="check-row"><input type="checkbox" checked={form.message.silent ?? false} disabled={form.fieldsDisabled} onChange={(event) => form.setMessage({ ...form.message, silent: event.target.checked })} />Send without notifications</label>
      <label className="check-row"><input type="checkbox" checked={form.message.tts ?? false} disabled={form.fieldsDisabled || !options.canTts} onChange={(event) => form.setMessage({ ...form.message, tts: event.target.checked })} />Text-to-speech</label>
      {form.message.reply_to && <div className="schedule-reply"><label className="check-row"><input type="checkbox" checked={form.message.replied_user ?? true} disabled={form.fieldsDisabled} onChange={(event) => form.setMessage({ ...form.message, replied_user: event.target.checked })} />Mention the person I am replying to</label><Button size="sm" variant="ghost" disabled={form.fieldsDisabled} onClick={() => form.setMessage({ ...form.message, reply_to: null })}>Remove reply</Button></div>}
    </div>
    {form.validation && <p className="field-error" role="alert">{form.validation}</p>}
    {form.error && <p className="field-error" role="alert">{form.error}</p>}
    {form.conflict && <section className="schedule-conflict" aria-label="Latest version">
      <h3>Latest version</h3><p>{scheduleTimeLabel(form.conflict.scheduled_at)}</p>
      <p className="schedule-message">{form.conflict.message?.content ?? 'The message text has been cleared after completion.'}</p>
      {form.conflict.status === 'pending' && <Button onClick={form.useLatest}>Load latest version</Button>}
    </section>}
    <p className="field-hint">The server sends this while your devices are offline. Service interruptions can delay delivery.</p>
    <div className="row-end"><Button variant="ghost" disabled={form.busy} onClick={onBack}>Back</Button><Button type="submit" variant="primary" data-autofocus={form.pending ? '' : undefined} loading={form.busy} disabled={!form.canSave}>{form.pending ? options.mode === 'standard' ? 'Retry confirmation' : 'Check confirmation' : form.isEditing ? 'Save changes' : 'Schedule message'}</Button></div>
  </form>;
}
