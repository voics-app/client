/** Message timestamp labels: "Today at 3:04 PM", "Yesterday at ...", else a short locale date. Pure; callers pass `now`. */

function dayKey(ms: number, timeZone?: string): string {
  // en-CA gives a sortable yyyy-mm-dd key in the requested zone.
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(new Date(ms));
}

/** Whole calendar days between `ms` and `nowMs` in the zone (0 = same day, 1 = yesterday). */
export function calendarDaysAgo(ms: number, nowMs: number, timeZone?: string): number {
  const a = Date.parse(`${dayKey(ms, timeZone)}T00:00:00Z`);
  const b = Date.parse(`${dayKey(nowMs, timeZone)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function clockTime(ms: number, locale?: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(ms));
}

/** Header label for a message timestamp. */
export function formatMessageTime(iso: string, nowMs: number, locale?: string, timeZone?: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const days = calendarDaysAgo(ms, nowMs, timeZone);
  if (days === 0) return `Today at ${clockTime(ms, locale, timeZone)}`;
  if (days === 1) return `Yesterday at ${clockTime(ms, locale, timeZone)}`;
  return `${new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeZone }).format(new Date(ms))} ${clockTime(ms, locale, timeZone)}`;
}

/** Full weekday, date and time shown as the hover tooltip on every message timestamp. */
export function fullMessageTime(iso: string, locale?: string, timeZone?: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short', timeZone }).format(new Date(ms));
}
