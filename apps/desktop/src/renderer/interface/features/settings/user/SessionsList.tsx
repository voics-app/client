import { DeviceMobile, Laptop, SignOut } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { orderSessions, sessionDetail, sessionTitle } from '@renderer/domain/authSessions';
import type { AuthSession } from '@shared/contracts/rest';
import { attempt } from '../../../app/actions';
import { getRuntime } from '../../../app/runtime';
import { Button } from '../../../shared/ui/Button';

const QUERY_KEY = ['auth-sessions'];

function isMobile(session: AuthSession): boolean {
  return session.os === 'Android' || session.os === 'iOS';
}

/** Login sessions of the account: this device first, then a Log out per other device. */
export function SessionsList() {
  const queryClient = useQueryClient();
  const sessions = useQuery({ queryKey: QUERY_KEY, queryFn: () => getRuntime().api.listSessions() });
  const [busy, setBusy] = useState<string | null>(null);
  const ordered = orderSessions(sessions.data ?? []);
  const others = ordered.filter((s) => !s.current);
  const now = Date.now();

  const run = async (key: string, action: () => Promise<void>, failure: string) => {
    setBusy(key);
    await attempt(action, failure);
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    setBusy(null);
  };

  const logoutOne = (session: AuthSession) =>
    run(session.id, () => getRuntime().api.revokeSession(session.id), 'Could not log out that device');

  const confirmLogoutAll = () =>
    useUiStore.getState().openDialog({
      kind: 'confirm',
      title: 'Log out all known devices?',
      body: 'Every device except this one will be signed out right away and will need to log in again.',
      confirmLabel: 'Log out all',
      danger: true,
      onConfirm: () => run('all', () => getRuntime().api.logoutOtherSessions(), 'Could not log out your other devices'),
    });

  return (
    <section aria-labelledby="sessions-heading" className="stack">
      <h2 id="sessions-heading">Logged-in devices</h2>
      {sessions.isError && <p className="field-error" role="alert">Could not load your devices.</p>}
      <ul className="manage-list">
        {ordered.map((session) => (
          <li key={session.id} data-testid={`session-${session.id}`}>
            {isMobile(session) ? <DeviceMobile size={26} weight="duotone" /> : <Laptop size={26} weight="duotone" />}
            <div className="manage-copy">
              <strong>{sessionTitle(session)}{session.current && ' (this device)'}</strong>
              <span>{sessionDetail(session, now)}</span>
            </div>
            {!session.current && (
              <Button size="sm" icon={<SignOut size={14} />} loading={busy === session.id} disabled={busy !== null} aria-label={`Log out ${sessionTitle(session)}`} onClick={() => void logoutOne(session)}>
                Log out
              </Button>
            )}
          </li>
        ))}
        {sessions.data?.length === 0 && <li className="pick-empty">No active sessions.</li>}
      </ul>
      {others.length > 0 && (
        <div className="row">
          <Button variant="danger" loading={busy === 'all'} disabled={busy !== null} onClick={confirmLogoutAll}>Log out all known devices</Button>
        </div>
      )}
    </section>
  );
}
