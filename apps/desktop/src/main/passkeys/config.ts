import type { ConnectionProfile } from '../../shared/ipc';
import type { PasskeySite } from '../../shared/passkeys';
import type { Env } from '../config';

/** Explicit API binding prevents a custom server from borrowing another server's RP. */
export function passkeySite(env: Env, connection: ConnectionProfile): PasskeySite | null {
  const raw = env.DISCORDY_PASSKEY_ORIGIN;
  const rpId = env.DISCORDY_PASSKEY_RP_ID;
  const api = env.DISCORDY_PASSKEY_API_URL;
  if (!raw || !rpId || !api || api.replace(/\/+$/, '') !== connection.apiUrl.replace(/\/+$/, '')) return null;
  try {
    const url = new URL(raw);
    const local = connection.id === 'local' && url.hostname === 'localhost' && url.protocol === 'http:';
    if (url.protocol !== 'https:' && !local) return null;
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    if (!/^[a-z0-9.-]+$/.test(rpId) || rpId.startsWith('.') || rpId.endsWith('.')) return null;
    if (url.hostname !== rpId && !url.hostname.endsWith(`.${rpId}`)) return null;
    return { origin: url.origin, rpId };
  } catch {
    return null;
  }
}
