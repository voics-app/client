import { useI18n } from '../../shared/i18n';
import { useEffect, useState } from 'react';
import { formatTimestamp } from '@discordy/core/domain/timestamp';
import type { TimestampStyle } from '@discordy/core/domain/markdown';
import { TIMESTAMP_STYLES, localInputValues, parseLocalDateTime, timestampMarkup } from '@discordy/core/domain/timestampPicker';
import { Button } from '../../shared/ui/Button';
import { Field, Input, Select } from '../../shared/ui/Form';
import { Modal } from '../../shared/ui/Modal';

/** Date and time picker that hands back a `<t:unix:style>` timestamp for the composer to insert. */
export function TimestampPicker({ open, onClose, onInsert }: { open: boolean; onClose: () => void; onInsert: (markup: string) => void }) {
  const { t, locale } = useI18n();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [style, setStyle] = useState<TimestampStyle>('f');

  useEffect(() => {
    if (!open) return;
    const now = localInputValues(Math.floor(Date.now() / 1000));
    setDate(now.date);
    setTime(now.time);
    setStyle('f');
  }, [open]);

  const unix = parseLocalDateTime(date, time);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('timestamp.title')}
      description={t('timestamp.description')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={unix === null} onClick={() => unix !== null && onInsert(timestampMarkup(unix, style))}>{t('timestamp.insert')}</Button>
        </>
      }
    >
      <Field label={t('language.date')}>{(id) => <Input id={id} type="date" data-autofocus value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
      <Field label={t('timestamp.time')}>{(id) => <Input id={id} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}</Field>
      <Field label={t('timestamp.format')}>
        {(id) => (
          <Select id={id} value={style} onChange={(e) => setStyle(e.target.value as TimestampStyle)}>
            {TIMESTAMP_STYLES.map((s) => (
              <option key={s.style} value={s.style}>{unix === null ? t(`timestamp.${s.style}`) : `${t(`timestamp.${s.style}`)}: ${formatTimestamp(unix, s.style, Date.now(), locale)}`}</option>
            ))}
          </Select>
        )}
      </Field>
    </Modal>
  );
}
