import { afterEach, describe, expect, it } from 'vitest';
import type { ScheduledMessage } from '../../src/contracts/scheduledMessages';
import { localScheduleInput, localScheduleInstant, newerSchedule, scheduleDraftError, scheduleStatus, scheduleTimeError, scheduleTimeLabel, scheduleUnavailable, SCHEDULE_MAX_DELAY, SCHEDULE_MIN_DELAY } from '../../src/domain/scheduledMessages';

const timezone = process.env.TZ;
afterEach(() => { if (timezone === undefined) delete process.env.TZ; else process.env.TZ = timezone; });

describe('scheduled-message local time', () => {
  it('converts local wall time to UTC and makes the actual offset visible', () => {
    process.env.TZ = 'Europe/Berlin';
    const instant = localScheduleInstant('2026-11-19T09:30');
    expect(instant).toBe('2026-11-19T08:30:00.000Z');
    expect(localScheduleInput(instant!)).toBe('2026-11-19T09:30');
    expect(scheduleTimeLabel(instant!, 'en-GB')).toContain('GMT+1');
  });
  it('rejects nonexistent calendar and spring-forward times, and displays the chosen fall-back offset', () => {
    process.env.TZ = 'Europe/Berlin';
    expect(localScheduleInstant('2026-02-31T09:30')).toBeNull();
    expect(localScheduleInstant('2026-03-29T02:30')).toBeNull();
    expect(localScheduleInstant('2026-10-25T02:30')).toBe('2026-10-25T00:30:00.000Z');
    expect(scheduleTimeLabel(localScheduleInstant('2026-10-25T02:30')!, 'en-GB')).toContain('GMT+2');
    expect(localScheduleInstant('2026-11-19T24:01')).toBeNull();
  });
  it('enforces the one-minute and thirty-day limits without rounding an invalid instant into range', () => {
    const now = Date.parse('2026-11-18T12:00:00Z');
    const at = (delay: number) => new Date(now + delay).toISOString();
    expect(scheduleTimeError(at(SCHEDULE_MIN_DELAY - 1), now)).toBeTruthy();
    expect(scheduleTimeError(at(SCHEDULE_MIN_DELAY), now)).toBeNull();
    expect(scheduleTimeError(at(SCHEDULE_MAX_DELAY), now)).toBeNull();
    expect(scheduleTimeError(at(SCHEDULE_MAX_DELAY + 1), now)).toBeTruthy();
  });
});

it('rejects empty/oversized text and unsupported composer modes instead of dropping fields', () => {
  expect(scheduleDraftError({ content: ' \n' })).toBeTruthy();
  expect(scheduleDraftError({ content: '🎵'.repeat(2000) })).toBeNull();
  expect(scheduleDraftError({ content: '🎵'.repeat(2001) })).toBeTruthy();
  const allowed = { mode: 'standard' as const, attachments: 0, editing: false, command: false, canSend: true };
  expect(scheduleUnavailable(allowed)).toBeNull();
  expect(scheduleUnavailable({ ...allowed, mode: 'ephemeral' })).toContain('Standard');
  expect(scheduleUnavailable({ ...allowed, mode: 'p2p' })).toContain('Standard');
  expect(scheduleUnavailable({ ...allowed, attachments: 1 })).toContain('attachments');
  expect(scheduleUnavailable({ ...allowed, command: true })).toContain('commands');
  expect(scheduleUnavailable({ ...allowed, editing: true })).toContain('editing');
});

it('never resurrects a cleared terminal draft or describes an unknown outcome as delivery', () => {
  const pending = { id: 's', revision: 1, status: 'pending', message: { content: 'private draft' } } as ScheduledMessage;
  const unknown = { ...pending, revision: 3, status: 'delivery_unknown', message: null, message_id: '99', failure: 'delivery_unknown' } as ScheduledMessage;
  expect(newerSchedule(unknown, pending)).toBe(unknown);
  expect(scheduleStatus(unknown)).toEqual({ title: 'Delivery could not be confirmed', detail: 'The message may have been sent. Inspect the channel before composing another copy.' });
});
