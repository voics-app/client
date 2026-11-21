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
  const userId = useSessionStore((s) => s.user?.id);
  const qc = useQueryClient();
  const grants = useQuery({ queryKey: ['authorizations', userId], queryFn: () => getRuntime().api.applicationAuthorizations() });
  const revoke = (grant: ApplicationAuthorization) => useUiStore.getState().openDialog({
    kind: 'confirm', title: `Revoke consent for ${grant.application.name}?`, confirmLabel: 'Revoke consent', danger: true,
    body: `This removes your recorded consent for ${guildName(grant)}. The shared bot stays installed and its server permissions remain unchanged. Server managers can remove it in Server Settings → Integrations.`,
    onConfirm: async () => { await getRuntime().api.revokeApplicationAuthorization(grant.id); await qc.invalidateQueries({ queryKey: ['authorizations', userId] }); },
  });
  return <div className="settings-page">
    <h1>Authorized apps</h1>
    <p className="page-sub">Applications you explicitly authorized in a server. These are your consent records; applications you own are in Developer settings.</p>
    {grants.isPending ? <p role="status">Loading authorized apps…</p> : grants.isError ? <div><p role="alert" className="field-error">Could not load authorized apps. {errorMessage(grants.error)}</p><Button onClick={() => void grants.refetch()}>Try again</Button></div> : grants.data.length === 0 ? <div className="integration-empty"><h2>No authorized apps</h2><p>Applications appear here after you authorize a bot invitation. Existing server bots do not imply your personal consent.</p></div> : <ul className="integration-list" aria-label="Authorized applications">{grants.data.map((grant) => <li key={grant.id}>
      <div className="integration-identity"><Avatar id={grant.application.id} name={grant.application.name} avatar={grant.application.icon} kind="app-icons" size={40} square /><div><h2>{grant.application.name}</h2><p>{guildName(grant)} · Authorized {new Date(grant.authorized_at).toLocaleDateString()}</p></div><Button variant="ghost" size="sm" onClick={() => revoke(grant)}>Revoke consent</Button></div>
      <details className="integration-details"><summary>Scopes and permissions acknowledged</summary><p>Add a server bot{grant.scopes.includes('applications.commands') ? ' and use application commands' : ''}.</p><PermissionChecklist permissions={grant.permissions} /></details>
    </li>)}</ul>}
  </div>;
}

const guildName = (grant: ApplicationAuthorization) => grant.guild.name;
