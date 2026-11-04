/** Pure model of the composer's timestamp picker: local date and time inputs to `<t:unix:style>` markup. */
import type { TimestampStyle } from './markdown';

export const TIMESTAMP_STYLES: ReadonlyArray<{ style: TimestampStyle; label: string }> = [
  { style: 't', label: 'Short time' },
  { style: 'T', label: 'Long time' },
  { style: 'd', label: 'Short date' },
  { style: 'D', label: 'Long date' },
  { style: 'f', label: 'Short date and time' },
  { style: 'F', label: 'Long date and time' },
  { style: 'R', label: 'Relative' },
];

export function timestampMarkup(unix: number, style: TimestampStyle): string {
  return `<t:${unix}:${style}>`;
}

const two = (n: number) => String(n).padStart(2, '0');

/** Values for `<input type="date">` and `<input type="time">` in the viewer's local time zone. */
export function localInputValues(unix: number): { date: string; time: string } {
  const d = new Date(unix * 1000);
  return { date: `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`, time: `${two(d.getHours())}:${two(d.getMinutes())}` };
}

/** Unix seconds for a local `YYYY-MM-DD` and `HH:mm`, or null when either is missing or not a real date. */
export function parseLocalDateTime(date: string, time: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const [year, month, day, hour, minute] = [d[1], d[2], d[3], t[1], t[2]].map(Number) as [number, number, number, number, number];
  const value = new Date(year, month - 1, day, hour, minute);
  const exact = value.getFullYear() === year && value.getMonth() === month - 1 && value.getDate() === day && value.getHours() === hour && value.getMinutes() === minute;
  return exact ? Math.floor(value.getTime() / 1000) : null;
}

/** `@ti` and `@time` open the picker; a single letter is left to member names. */
export function timeTriggerMatches(query: string): boolean {
  return query.length >= 2 && 'time'.startsWith(query);
}
