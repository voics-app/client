import type { TimestampStyle } from './markdown';

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
  ['second', 1],
];

const FORMATS: Record<Exclude<TimestampStyle, 'R'>, Intl.DateTimeFormatOptions> = {
  t: { hour: 'numeric', minute: '2-digit' },
  T: { hour: 'numeric', minute: '2-digit', second: '2-digit' },
  d: { year: 'numeric', month: '2-digit', day: '2-digit' },
  D: { year: 'numeric', month: 'long', day: 'numeric' },
  f: { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' },
  F: { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' },
};

/** Largest unix value a JS Date can represent (in seconds). */
const MAX_UNIX = 8_640_000_000_000;

export function isValidUnix(unix: number): boolean {
  return Number.isFinite(unix) && Math.abs(unix) <= MAX_UNIX;
}

/** "in 3 hours" / "2 minutes ago". */
export function relativeTime(unix: number, nowMs: number, locale?: string): string {
  const diff = Math.round(unix - nowMs / 1000);
  const abs = Math.abs(diff);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, seconds] of UNITS) {
    if (abs >= seconds || unit === 'second') {
      return formatter.format(Math.trunc(diff / seconds), unit);
    }
  }
  return formatter.format(0, 'second');
}

/** Renders a Discord `<t:unix:style>` value in the viewer's local time zone. */
export function formatTimestamp(unix: number, style: TimestampStyle, nowMs = Date.now(), locale?: string, timeZone?: string): string {
  if (!isValidUnix(unix)) return 'Invalid date';
  if (style === 'R') return relativeTime(unix, nowMs, locale);
  return new Intl.DateTimeFormat(locale, { ...FORMATS[style], timeZone }).format(new Date(unix * 1000));
}

/** Full local date and time, used as the hover tooltip for every style. */
export function timestampTooltip(unix: number, locale?: string, timeZone?: string): string {
  if (!isValidUnix(unix)) return 'Invalid date';
  return new Intl.DateTimeFormat(locale, { ...FORMATS.F, timeZoneName: 'short', timeZone }).format(new Date(unix * 1000));
}

/** How often a relative timestamp needs re-rendering. */
export function relativeTickMs(unix: number, nowMs: number): number {
  const abs = Math.abs(unix - nowMs / 1000);
  if (abs < 60) return 1000;
  if (abs < 3600) return 30_000;
  return 60_000;
}
