import type { DeliveryMode } from '../contracts/rest';
import type { ScheduledMessage, ScheduledMessageDraft, ScheduledMessageFailure } from '../contracts/scheduledMessages';

export const SCHEDULE_MIN_DELAY = 60_000;
export const SCHEDULE_MAX_DELAY = 30 * 24 * 60 * 60_000;

export function scheduleDraftError(message: ScheduledMessageDraft): string | null {
  if (!message.content.trim()) return 'Write a message to schedule.';
  if ([...message.content].length > 2000) return 'Use 2,000 characters or fewer.';
  return null;
}

export function scheduleUnavailable(input: { mode: DeliveryMode; attachments: number; editing: boolean; command: boolean; canSend: boolean }): string | null {
  if (input.mode !== 'standard') return 'Scheduled messages are available only in Standard chats.';
  if (!input.canSend) return 'You do not have permission to send messages here.';
  if (input.editing) return 'Finish editing before scheduling another message.';
  if (input.attachments > 0) return 'Remove attachments to schedule a text message.';
  if (input.command) return 'Application commands cannot be scheduled.';
  return null;
}

export function scheduleTimeError(instant: string, now = Date.now()): string | null {
  const timestamp = Date.parse(instant);
  if (!Number.isFinite(timestamp)) return 'Choose a valid date and time.';
  if (timestamp - now < SCHEDULE_MIN_DELAY) return 'Choose a time at least one minute from now.';
  if (timestamp - now > SCHEDULE_MAX_DELAY) return 'Choose a time within the next 30 days.';
  return null;
}

/** A round trip rejects invalid dates and local times skipped by daylight saving. */
export function localScheduleInstant(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
  const date = new Date(year, month - 1, day, hour, minute);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute) return null;
  return date.toISOString();
}

export function localScheduleInput(instant: string | number): string {
  const date = new Date(instant);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function scheduleTimeLabel(instant: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset' }).format(new Date(instant));
}

export function nextScheduleTime(now = Date.now()): string {
  return localScheduleInput(Math.ceil((now + 5 * SCHEDULE_MIN_DELAY) / SCHEDULE_MIN_DELAY) * SCHEDULE_MIN_DELAY);
}

export function newerSchedule(previous: ScheduledMessage | undefined, incoming: ScheduledMessage): ScheduledMessage {
  return previous && previous.revision >= incoming.revision ? previous : incoming;
}

const failures: Record<ScheduledMessageFailure, string> = {
  access_denied: 'Your permission to send changed before delivery.',
  channel_missing: 'This channel is no longer available.',
  delivery_mode_changed: 'This chat no longer uses Standard delivery.',
  invalid_message: 'The message or its reply target could no longer be sent.',
  dependency_unavailable: 'The service could not complete delivery.',
  delivery_unknown: 'The message may have been sent. Inspect the channel before composing another copy.',
};

export function scheduleStatus(item: ScheduledMessage): { title: string; detail: string } {
  switch (item.status) {
    case 'pending': return { title: 'Scheduled', detail: 'Waiting to send. Service interruptions may delay delivery.' };
    case 'dispatching': return { title: 'Sending', detail: 'Delivery has started. Editing and cancellation are no longer available.' };
    case 'sent': return { title: 'Sent', detail: 'The message was saved in the channel.' };
    case 'cancelled': return { title: 'Cancelled', detail: 'This scheduled message will not be sent.' };
    case 'delivery_unknown': return { title: 'Delivery could not be confirmed', detail: failures.delivery_unknown };
    case 'failed': return { title: 'Not sent', detail: item.failure ? failures[item.failure] : 'The message could not be sent.' };
  }
}
