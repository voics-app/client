import { useI18n } from '../../shared/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import type { ApplicationAuthorization } from '@discordy/core/contracts/rest';
import { errorMessage } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { PermissionChecklist } from './BotAuthorizeDialog';
import './integrations.css';

export function AuthorizedApps() {
  const { t: msg, date } = useI18n();
  const userId = useSessionStore((s) => s.user?.id);
  const qc = useQueryClient();
  const grants = useQuery({ queryKey: ['authorizations', userId], queryFn: () => getRuntime().api.applicationAuthorizations() });
  const revoke = (grant: ApplicationAuthorization) => useUiStore.getState().openDialog({
    kind: 'confirm', title: msg('integrations.revokeTitle', { name: grant.application.name }), confirmLabel: msg("settings.authorizedapps.revoke.consent"), danger: true,
    body: msg('integrations.revokeBody', { name: guildName(grant) }),
    onConfirm: async () => { await getRuntime().api.revokeApplicationAuthorization(grant.id); await qc.invalidateQueries({ queryKey: ['authorizations', userId] }); },
  });
  return <div className="settings-page">
    <h1>{msg("settings.authorizedapps.authorized.apps")}</h1>
    <p className="page-sub">{msg("settings.authorizedapps.applications.you.explicitly.authorized.in.a.server.these.are")}</p>
    {grants.isPending ? <p role="status">{msg("settings.authorizedapps.loading.authorized.apps")}</p> : grants.isError ? <div><p role="alert" className="field-error">{msg("settings.authorizedapps.could.not.load.authorized.apps")} {errorMessage(grants.error)}</p><Button onClick={() => void grants.refetch()}>{msg("common.retry")}</Button></div> : grants.data.length === 0 ? <div className="integration-empty"><h2>{msg("settings.authorizedapps.no.authorized.apps")}</h2><p>{msg("settings.authorizedapps.applications.appear.here.after.you.authorize.a.bot.invitation")}</p></div> : <ul className="integration-list" aria-label={msg("settings.authorizedapps.authorized.applications")}>{grants.data.map((grant) => <li key={grant.id}>
      <div className="integration-identity"><Avatar id={grant.application.id} name={grant.application.name} avatar={grant.application.icon} kind="app-icons" size={40} square /><div><h2>{grant.application.name}</h2><p>{msg('integrations.authorizedDate', { guild: guildName(grant), date: date(new Date(grant.authorized_at)) })}</p></div><Button variant="ghost" size="sm" onClick={() => revoke(grant)}>{msg("settings.authorizedapps.revoke.consent")}</Button></div>
      <details className="integration-details"><summary>{msg("settings.authorizedapps.scopes.and.permissions.acknowledged")}</summary><p>{msg('integrations.scopeSummary', { commands: grant.scopes.includes('applications.commands') })}</p><PermissionChecklist permissions={grant.permissions} /></details>
    </li>)}</ul>}
  </div>;
}

const guildName = (grant: ApplicationAuthorization) => grant.guild.name;
