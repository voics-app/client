import { useI18n } from '../../../shared/i18n';
import { DeviceMobile, Laptop, SignOut } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { orderSessions, sessionDetail, sessionTitle } from '@discordy/core/domain/authSessions';
import type { AuthSession } from '@discordy/core/contracts/rest';
import { attempt } from '../../../app/actions';
import { getRuntime } from '../../../app/runtime';
import { Button } from '../../../shared/ui/Button';

const QUERY_KEY = ['auth-sessions'];

function isMobile(session: AuthSession): boolean {
  return session.os === 'Android' || session.os === 'iOS';
}

/** Login sessions of the account: this device first, then a Log out per other device. */
export function SessionsList() {
  const { t: msg, locale } = useI18n();
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
    run(session.id, () => getRuntime().api.revokeSession(session.id), msg("settings.sessionslist.could.not.log.out.that.device"));

  const confirmLogoutAll = () =>
    useUiStore.getState().openDialog({
      kind: 'confirm',
      title: msg("settings.sessionslist.log.out.all.known.devices"),
      body: msg("settings.sessionslist.every.device.except.this.one.will.be.signed.out"),
      confirmLabel: msg("settings.sessionslist.log.out.all"),
      danger: true,
      onConfirm: () => run('all', () => getRuntime().api.logoutOtherSessions(), msg("settings.sessionslist.could.not.log.out.your.other.devices")),
    });

  return (
    <section aria-labelledby="sessions-heading" className="stack">
      <h2 id="sessions-heading">{msg("settings.sessionslist.logged.in.devices")}</h2>
      {sessions.isError && <p className="field-error" role="alert">{msg("settings.sessionslist.could.not.load.your.devices")}</p>}
      <ul className="manage-list">
        {ordered.map((session) => (
          <li key={session.id} data-testid={`session-${session.id}`}>
            {isMobile(session) ? <DeviceMobile size={26} weight="duotone" /> : <Laptop size={26} weight="duotone" />}
            <div className="manage-copy">
              <strong>{sessionTitle(session, locale)}{session.current && msg("settings.sessionslist.this.device")}</strong>
              <span>{sessionDetail(session, now, locale)}</span>
            </div>
            {!session.current && (
              <Button size="sm" icon={<SignOut size={14} />} loading={busy === session.id} disabled={busy !== null} aria-label={msg('sessions.logout', { name: sessionTitle(session, locale) })} onClick={() => void logoutOne(session)}>
                {msg("settings.logout")} </Button>
            )}
          </li>
        ))}
        {sessions.data?.length === 0 && <li className="pick-empty">{msg("settings.sessionslist.no.active.sessions")}</li>}
      </ul>
      {others.length > 0 && (
        <div className="row">
          <Button variant="danger" loading={busy === 'all'} disabled={busy !== null} onClick={confirmLogoutAll}>{msg("settings.sessionslist.log.out.all.known.devices.99c2fac")}</Button>
        </div>
      )}
    </section>
  );
}
