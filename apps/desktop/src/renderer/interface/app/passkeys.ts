import { getI18n } from '../shared/i18n';
import { useEffect, useState } from 'react';
import type { PasskeySite } from '@shared/passkeys';
import { bridge } from './bridge';

export function usePasskeySite(): PasskeySite | null | undefined {
  const [site, setSite] = useState<PasskeySite | null>();
  useEffect(() => {
    let active = true;
    void (bridge?.passkeys.site() ?? Promise.resolve(null)).then(value => { if (active) setSite(value); }).catch(() => { if (active) setSite(null); });
    return () => { active = false; };
  }, []);
  return site;
}

const failures = {
  cancelled: getI18n().catalogText("Passkey request cancelled. Try again, or use a backup code to sign in."),
  timeout: getI18n().catalogText("The passkey request expired. Start again."),
  unavailable: getI18n().catalogText("The browser could not open a passkey request. Check your default browser or use a backup code."),
  failed: getI18n().catalogText("The browser could not complete this passkey request. Start again or use a backup code."),
};

export async function performPasskey(kind: 'create' | 'get', publicKey: Record<string, unknown>, signal: AbortSignal): Promise<Record<string, unknown>> {
  signal.throwIfAborted();
  if (!bridge?.passkeys) throw new Error(getI18n().catalogText("Passkeys require the desktop browser bridge and a configured HTTPS ceremony site."));
  const passkeys = bridge.passkeys;
  const id = crypto.randomUUID();
  const cancel = () => { void passkeys.cancel(id); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const result = await passkeys.perform({ id, kind, publicKey });
    signal.throwIfAborted();
    if (!result.ok) throw new Error(failures[result.reason]);
    return result.credential;
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}
