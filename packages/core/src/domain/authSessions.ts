import type { AuthSession } from '../contracts/rest';
import { brand } from './brandConfig';
import { createI18n } from './i18n';
import { relativeTime } from './timestamp';

/** The current session first, then the most recently used. */
export function orderSessions(sessions: readonly AuthSession[]): AuthSession[] {
  return [...sessions].sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    return Date.parse(b.last_used_at) - Date.parse(a.last_used_at);
  });
}

/** The api names the desktop app generically; the client shows it with the brand name. */
const DESKTOP_APP = 'Desktop app';

function clientName(client: string): string {
  return client === DESKTOP_APP ? brand().displayName : client;
}

/** "Firefox on Windows"; just the client when the OS is unknown. */
export function sessionTitle(session: AuthSession, locale?: string): string {
  const client = clientName(session.client);
  return session.os === 'Unknown' ? client : createI18n(locale).t('sessions.title', { client, os: session.os });
}

/** Country name for an ISO 3166-1 code, or the code itself when the runtime cannot name it. */
export function regionName(code: string, locale = 'en'): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** "Netherlands · Laptop · Active 2 minutes ago", leaving out what is unknown. */
export function sessionDetail(session: AuthSession, nowMs: number, locale = 'en'): string {
  const { t } = createI18n(locale);
  const parts: string[] = [];
  if (session.location) parts.push(regionName(session.location, locale));
  if (session.device_name) parts.push(session.device_name);
  parts.push(session.current ? t('sessions.activeNow') : t('sessions.active', { time: relativeTime(Date.parse(session.last_used_at) / 1000, nowMs, locale) }));
  return parts.join(' · ');
}
