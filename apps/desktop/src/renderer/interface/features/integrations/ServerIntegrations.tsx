import { useI18n } from '../../shared/i18n';
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
  const { t: msg } = useI18n();
  const userId = useSessionStore((s) => s.user?.id);
  const permissions = useGuildPermissions(guildId);
  const apps = hasPermission(permissions, Permission.MANAGE_GUILD);
  const hooks = hasPermission(permissions, Permission.MANAGE_WEBHOOKS);
  const audit = hasPermission(permissions, Permission.VIEW_AUDIT_LOG);
  return <div className="settings-page">
    <h1>{msg("settings.serverintegrations.integrations")}</h1><p className="page-sub">{msg("settings.serverintegrations.manage.applications.and.incoming.webhooks.connected.to.this.server")}</p>
    {apps && <InstalledApplications key={`apps:${guildId}:${userId}`} guildId={guildId} canAudit={audit} canKick={hasPermission(permissions, Permission.KICK_MEMBERS)} />}
    {hooks && <Webhooks key={`hooks:${guildId}:${userId}`} guildId={guildId} canAudit={audit} />}
    {!apps && !hooks && <p>{msg("settings.serverintegrations.you.need.manage.server.or.manage.webhooks.permission.to")}</p>}
  </div>;
}

function InstalledApplications({ guildId, canAudit, canKick }: { guildId: string; canAudit: boolean; canKick: boolean }) {
  const { t: msg, date } = useI18n();
  const userId = useSessionStore((s) => s.user?.id);
  const qc = useQueryClient();
  const installed = useQuery({ queryKey: ['guild', guildId, 'integrations', userId], queryFn: () => getRuntime().api.guildIntegrations(guildId) });
  const remove = (integration: GuildIntegration) => useUiStore.getState().openDialog({ kind: 'confirm', title: msg('integrations.removeTitle', { name: integration.application.name }), body: msg("settings.serverintegrations.this.removes.the.bot.from.this.server.deletes.its"), confirmLabel: msg("settings.serverintegrations.remove.application"), danger: true, onConfirm: async () => {
    await getRuntime().api.removeGuildIntegration(guildId, integration.application.id);
    await Promise.all([qc.invalidateQueries({ queryKey: ['guild', guildId, 'integrations'] }), qc.invalidateQueries({ queryKey: ['authorizations'] })]);
  } });
  return <section className="integration-section"><h2>{msg("settings.serverintegrations.installed.applications")}</h2>
    {installed.isPending ? <p role="status">{msg("settings.serverintegrations.loading.applications")}</p> : installed.isError ? <div><p role="alert" className="field-error">{msg("settings.developertab.could.not.load.applications")} {errorMessage(installed.error)}</p><Button onClick={() => void installed.refetch()}>{msg("common.retry")}</Button></div> : installed.data.length === 0 ? <p className="page-sub">{msg("settings.serverintegrations.no.application.bots.are.installed.open.a.bot.s")}</p> : <ul className="integration-list" aria-label={msg("settings.serverintegrations.installed.applications")}>{installed.data.map((integration) => <li key={integration.application.id}>
      <div className="integration-identity"><Avatar id={integration.application.id} name={integration.application.name} avatar={integration.application.icon} kind="app-icons" size={40} square /><div><h3>{integration.application.name}</h3><p>{msg('integrations.installedDate', { date: date(new Date(integration.installed_at)) })}</p></div><Button variant="ghost" size="sm" disabled={!canKick} title={!canKick ? msg("settings.serverintegrations.kick.members.permission.is.also.required") : undefined} onClick={() => remove(integration)}>{msg("common.remove")}</Button></div>
      <details className="integration-details"><summary>{msg("settings.serverintegrations.current.server.permissions")}</summary><PermissionChecklist permissions={integration.permissions} /></details>
      {canAudit && integration.application.bot?.id && <Button variant="ghost" size="sm" onClick={() => openIntegrationAudit(guildId, integration.application.bot!.id, integration.application.name)}>{msg("domain.view.audit.log")}</Button>}
    </li>)}</ul>}
    {!canKick && <p className="field-hint">{msg("settings.serverintegrations.removing.an.application.also.requires.kick.members.permission.and")}</p>}
  </section>;
}

function Webhooks({ guildId, canAudit }: { guildId: string; canAudit: boolean }) {
  const { t: msg } = useI18n();
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
  return <section className="integration-section"><div className="integration-section-heading"><h2>{msg("settings.serverintegrations.webhooks")}</h2><Button size="sm" variant="primary" disabled={channels.length === 0} onClick={() => choose('new')}>{msg("settings.serverintegrations.new.webhook")}</Button></div>
    <p className="page-sub">{msg("settings.serverintegrations.send.messages.from.external.services.execution.urls.are.shown")}</p>
    {channels.length === 0 && <p className="field-hint">{msg("settings.serverintegrations.you.need.access.and.manage.webhooks.permission.in.an")}</p>}
    {hooks.isPending ? <p role="status">{msg("settings.serverintegrations.loading.webhooks")}</p> : hooks.isError ? <div><p role="alert" className="field-error">{msg("settings.serverintegrations.could.not.load.webhooks")} {errorMessage(hooks.error)}</p><Button onClick={() => void hooks.refetch()}>{msg("common.retry")}</Button></div> : hooks.data.length === 0 ? <p>{msg("settings.serverintegrations.no.webhooks.yet")}</p> : <ul className="integration-list" aria-label={msg("settings.serverintegrations.webhooks")}>{hooks.data.map((hook) => <li key={hook.id}>
      <div className="integration-identity"><Avatar id={hook.id} name={hook.name ?? msg("settings.serverintegrations.webhook")} avatar={hook.avatar} size={36} /><div><h3>{hook.name ?? msg("settings.serverintegrations.webhook")}</h3><p>{hook.channel_id && allChannels[hook.channel_id] ? `#${allChannels[hook.channel_id]?.name}` : msg("settings.serverintegrations.unavailable.channel")}</p></div><Button size="sm" variant="ghost" onClick={() => choose(hook)}>{msg("settings.accountsecurity.edit")}</Button></div>
    </li>)}</ul>}
    {selected && <WebhookEditor key={selected === 'new' ? `new:${newDraft}` : selected.id} guildId={guildId} initial={selected === 'new' ? null : selected} channels={channels} canAudit={canAudit} onClose={() => choose(null)} onSaved={() => void qc.invalidateQueries({ queryKey: ['guild', guildId, 'webhooks'] })} />}
  </section>;
}
