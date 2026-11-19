import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { useUnsavedStore } from '@discordy/core/application/stores/unsavedStore';
import { Permission } from '@discordy/core/contracts/permissions';
import type { GuildIntegration, Webhook } from '@discordy/core/contracts/rest';
import { webhookChannels } from '@discordy/core/domain/integrations';
import { hasPermission } from '@discordy/core/domain/permissions';
import { errorMessage } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { useGuildPermissions } from '../../shared/hooks/usePermissions';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { PermissionChecklist } from './BotAuthorizeDialog';
import { WebhookEditor } from './WebhookEditor';
import { openIntegrationAudit } from './integrationActions';
import './integrations.css';

export function ServerIntegrations({ guildId }: { guildId: string }) {
  const userId = useSessionStore((s) => s.user?.id);
  const permissions = useGuildPermissions(guildId);
  const apps = hasPermission(permissions, Permission.MANAGE_GUILD);
  const hooks = hasPermission(permissions, Permission.MANAGE_WEBHOOKS);
  const audit = hasPermission(permissions, Permission.VIEW_AUDIT_LOG);
  return <div className="settings-page">
    <h1>Integrations</h1><p className="page-sub">Manage applications and incoming webhooks connected to this server.</p>
    {apps && <InstalledApplications key={`apps:${guildId}:${userId}`} guildId={guildId} canAudit={audit} canKick={hasPermission(permissions, Permission.KICK_MEMBERS)} />}
    {hooks && <Webhooks key={`hooks:${guildId}:${userId}`} guildId={guildId} canAudit={audit} />}
    {!apps && !hooks && <p>You need Manage Server or Manage Webhooks permission to manage integrations.</p>}
  </div>;
}

function InstalledApplications({ guildId, canAudit, canKick }: { guildId: string; canAudit: boolean; canKick: boolean }) {
  const userId = useSessionStore((s) => s.user?.id);
  const qc = useQueryClient();
  const installed = useQuery({ queryKey: ['guild', guildId, 'integrations', userId], queryFn: () => getRuntime().api.guildIntegrations(guildId) });
  const remove = (integration: GuildIntegration) => useUiStore.getState().openDialog({ kind: 'confirm', title: `Remove ${integration.application.name}?`, body: 'This removes the bot from this server, deletes its managed roles and clears everyone’s consent records for this installation. Other servers and the bot’s credentials stay unchanged.', confirmLabel: 'Remove application', danger: true, onConfirm: async () => {
    await getRuntime().api.removeGuildIntegration(guildId, integration.application.id);
    await Promise.all([qc.invalidateQueries({ queryKey: ['guild', guildId, 'integrations'] }), qc.invalidateQueries({ queryKey: ['authorizations'] })]);
  } });
  return <section className="integration-section"><h2>Installed applications</h2>
    {installed.isPending ? <p role="status">Loading applications…</p> : installed.isError ? <div><p role="alert" className="field-error">Could not load applications. {errorMessage(installed.error)}</p><Button onClick={() => void installed.refetch()}>Try again</Button></div> : installed.data.length === 0 ? <p className="page-sub">No application bots are installed. Open a bot’s invitation link to review its permissions and add it.</p> : <ul className="integration-list" aria-label="Installed applications">{installed.data.map((integration) => <li key={integration.application.id}>
      <div className="integration-identity"><Avatar id={integration.application.id} name={integration.application.name} avatar={integration.application.icon} kind="app-icons" size={40} square /><div><h3>{integration.application.name}</h3><p>Installed {new Date(integration.installed_at).toLocaleDateString()}</p></div><Button variant="ghost" size="sm" disabled={!canKick} title={!canKick ? 'Kick Members permission is also required.' : undefined} onClick={() => remove(integration)}>Remove</Button></div>
      <details className="integration-details"><summary>Current server permissions</summary><PermissionChecklist permissions={integration.permissions} /></details>
      {canAudit && integration.application.bot?.id && <Button variant="ghost" size="sm" onClick={() => openIntegrationAudit(guildId, integration.application.bot!.id, integration.application.name)}>View audit log</Button>}
    </li>)}</ul>}
    {!canKick && <p className="field-hint">Removing an application also requires Kick Members permission and a higher role than the bot.</p>}
  </section>;
}

function Webhooks({ guildId, canAudit }: { guildId: string; canAudit: boolean }) {
  const userId = useSessionStore((s) => s.user?.id);
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const members = useGuildStore((s) => s.members[guildId]);
  const allChannels = useGuildStore((s) => s.channels);
  const [selected, setSelected] = useState<Webhook | 'new' | null>(null);
  const [newDraft, setNewDraft] = useState(0);
  const qc = useQueryClient();
  const hooks = useQuery({ queryKey: ['guild', guildId, 'webhooks', userId], queryFn: () => getRuntime().api.guildWebhooks(guildId) });
  const channels = guild && userId ? webhookChannels(Object.values(allChannels), { guildId, ownerId: guild.owner_id, userId, memberRoleIds: members?.[userId]?.roles ?? [], roles: guild.roles }) : [];
  const choose = (value: Webhook | 'new' | null) => {
    if (!useUnsavedStore.getState().requestLeave()) return;
    if (value === 'new') setNewDraft((version) => version + 1);
    setSelected(value);
  };
  return <section className="integration-section"><div className="integration-section-heading"><h2>Webhooks</h2><Button size="sm" variant="primary" disabled={channels.length === 0} onClick={() => choose('new')}>New webhook</Button></div>
    <p className="page-sub">Send messages from external services. Execution URLs are shown only after creation or regeneration.</p>
    {channels.length === 0 && <p className="field-hint">You need access and Manage Webhooks permission in an eligible channel to create a webhook.</p>}
    {hooks.isPending ? <p role="status">Loading webhooks…</p> : hooks.isError ? <div><p role="alert" className="field-error">Could not load webhooks. {errorMessage(hooks.error)}</p><Button onClick={() => void hooks.refetch()}>Try again</Button></div> : hooks.data.length === 0 ? <p>No webhooks yet.</p> : <ul className="integration-list" aria-label="Webhooks">{hooks.data.map((hook) => <li key={hook.id}>
      <div className="integration-identity"><Avatar id={hook.id} name={hook.name ?? 'Webhook'} avatar={hook.avatar} size={36} /><div><h3>{hook.name ?? 'Webhook'}</h3><p>{hook.channel_id && allChannels[hook.channel_id] ? `#${allChannels[hook.channel_id]?.name}` : 'Unavailable channel'}</p></div><Button size="sm" variant="ghost" onClick={() => choose(hook)}>Edit</Button></div>
    </li>)}</ul>}
    {selected && <WebhookEditor key={selected === 'new' ? `new:${newDraft}` : selected.id} guildId={guildId} initial={selected === 'new' ? null : selected} channels={channels} canAudit={canAudit} onClose={() => choose(null)} onSaved={() => void qc.invalidateQueries({ queryKey: ['guild', guildId, 'webhooks'] })} />}
  </section>;
}
