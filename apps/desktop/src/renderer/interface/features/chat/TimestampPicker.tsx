import { useEffect, useState } from 'react';
import { formatTimestamp } from '@discordy/core/domain/timestamp';
import type { TimestampStyle } from '@discordy/core/domain/markdown';
import { TIMESTAMP_STYLES, localInputValues, parseLocalDateTime, timestampMarkup } from '@discordy/core/domain/timestampPicker';
import { Button } from '../../shared/ui/Button';
import { Field, Input, Select } from '../../shared/ui/Form';
import { Modal } from '../../shared/ui/Modal';

/** Date and time picker that hands back a `<t:unix:style>` timestamp for the composer to insert. */
export function TimestampPicker({ open, onClose, onInsert }: { open: boolean; onClose: () => void; onInsert: (markup: string) => void }) {
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
      title="Insert a timestamp"
      description="Everyone sees it in their own time zone."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={unix === null} onClick={() => unix !== null && onInsert(timestampMarkup(unix, style))}>Insert</Button>
        </>
      }
    >
      <Field label="Date">{(id) => <Input id={id} type="date" data-autofocus value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
      <Field label="Time">{(id) => <Input id={id} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}</Field>
      <Field label="Format">
        {(id) => (
          <Select id={id} value={style} onChange={(e) => setStyle(e.target.value as TimestampStyle)}>
            {TIMESTAMP_STYLES.map((s) => (
              <option key={s.style} value={s.style}>{unix === null ? s.label : `${s.label}: ${formatTimestamp(unix, s.style)}`}</option>
            ))}
          </Select>
        )}
      </Field>
    </Modal>
  );
}
