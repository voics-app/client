import { useI18n } from '../../shared/i18n';
import { Check } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { permissionChecklist, type BotAuthorizationRequest } from '@discordy/core/domain/botAuthorization';
import { errorMessage } from '../../app/actions';
import { openGuild } from '../../app/navigation';
import { getRuntime } from '../../app/runtime';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { Field, Select } from '../../shared/ui/Form';
import { Modal } from '../../shared/ui/Modal';
import './integrations.css';

/** Extends Nightglass settings: app identity, server choice, explicit permissions, one consent action. */
export function BotAuthorizeDialog({ request }: { request: BotAuthorizationRequest }) {
  const { t: msg } = useI18n();
  const userId = useSessionStore((s) => s.user?.id);
  const qc = useQueryClient();
  const [guildId, setGuildId] = useState(request.guild_id ?? '');
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({ queryKey: ['bot-consent', userId, request], queryFn: () => getRuntime().api.botAuthorizationInfo(request), gcTime: 0 });
  const info = query.data;
  const guild = info?.guilds.find((g) => g.id === guildId);
  const permissions = guild?.bot_permissions ?? info?.permissions ?? '0';
  const installed = guild?.bot_permissions != null;
  const signature = `${userId}:${info?.application.id}:${guildId}:${guild?.installation_revision}:${installed}:${permissions}:${info?.scopes.join(' ') ?? ''}`;
  const close = () => { if (!busy) useUiStore.getState().openDialog(null); };
  const submit = async () => {
    if (!guild?.installation_revision || !info || confirmed !== signature) return;
    setBusy(true);
    setError(null);
    try {
      await getRuntime().api.authorizeBot({ client_id: request.client_id, guild_id: guild.id, scope: info.scopes.join(' '), permissions, installation_revision: guild.installation_revision });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['authorizations', userId] }),
        qc.invalidateQueries({ queryKey: ['guild', guild.id, 'integrations'] }),
      ]);
      useUiStore.getState().openDialog(null);
      openGuild(guild.id);
      useUiStore.getState().toast({ tone: 'success', title: installed ? msg("settings.botauthorizedialog.consent.recorded") : msg('integrations.added', { app: info.application.name, guild: guild.name }) });
    } catch (reason) {
      setError(errorMessage(reason));
      // A lifecycle conflict needs a fresh view before consent can be retried.
      setConfirmed(null);
      void query.refetch();
    } finally { setBusy(false); }
  };
  return <Modal open onClose={close} title={msg("settings.botauthorizedialog.authorize.application")} width={520}>
    <div className="integration-stack">
      {query.isPending ? <p role="status">{msg("settings.botauthorizedialog.loading.application")}</p> : query.isError ? <div><p role="alert" className="field-error">{msg("settings.botauthorizedialog.could.not.load.this.application")} {errorMessage(query.error)}</p><Button onClick={() => void query.refetch()}>{msg("common.retry")}</Button></div> : info && <>
        <div className="integration-identity"><Avatar id={info.application.id} avatar={info.application.icon} name={info.application.name} kind="app-icons" size={48} square /><div><h3>{info.application.name}</h3><p>{info.application.description || msg("settings.botauthorizedialog.an.application.bot.for.your.server")}</p></div></div>
        <ul className="integration-permissions" aria-label={msg("settings.botauthorizedialog.requested.scopes")}>
          <li><Check size={16} aria-hidden="true" />{msg("settings.botauthorizedialog.add.a.bot.to.a.server.you.manage")}</li>
          {info.scopes.includes('applications.commands') && <li><Check size={16} aria-hidden="true" />{msg("settings.botauthorizedialog.use.application.commands.in.that.server")}</li>}
        </ul>
        {info.guilds.length === 0 ? <p>{msg("settings.botauthorizedialog.you.need.manage.server.permission.in.a.server.to")}</p> : <>
          <Field label={msg("settings.profiledialog.server")}>{(id) => <Select id={id} value={guildId} disabled={busy} onChange={(event) => { setGuildId(event.target.value); setConfirmed(null); setError(null); }}><option value="">{msg("settings.botauthorizedialog.choose.a.server")}</option>{info.guilds.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>}</Field>
          {guild && <section className="integration-permission-review" aria-label={msg("settings.botauthorizedialog.permission.review")}>
            <h3>{installed ? msg("settings.botauthorizedialog.current.bot.permissions") : msg("settings.botauthorizedialog.requested.permissions")}</h3>
            {installed && <p>{msg("settings.botauthorizedialog.this.bot.is.already.installed.you.are.acknowledging.its")}</p>}
            <PermissionChecklist permissions={permissions} />
            {!installed && <p className="field-hint">{msg("settings.botauthorizedialog.the.bot.also.inherits.this.server.s.everyone.role")}</p>}
            <label className="check-row"><input type="checkbox" checked={confirmed === signature} disabled={busy} onChange={(event) => setConfirmed(event.target.checked ? signature : null)} />{msg("settings.botauthorizedialog.i.have.reviewed.these.permissions")}</label>
          </section>}
        </>}
      </>}
      {error && <p role="alert" className="field-error">{msg("settings.botauthorizedialog.could.not.authorize")} {error}</p>}
      <div className="row-end"><Button variant="ghost" disabled={busy} onClick={close}>{msg("common.cancel")}</Button><Button variant="primary" loading={busy} disabled={!guild?.installation_revision || confirmed !== signature || query.isError} onClick={() => void submit()}>{installed ? msg("settings.botauthorizedialog.record.consent") : msg("settings.botauthorizedialog.authorize")}</Button></div>
    </div>
  </Modal>;
}

export function PermissionChecklist({ permissions }: { permissions: string }) {
  const { t: msg, locale } = useI18n();
  const entries = permissionChecklist(permissions, locale);
  return entries.length === 0 ? <p className="field-hint">{msg("settings.botauthorizedialog.no.additional.permissions.requested")}</p> : <ul className="integration-permissions" aria-label={msg("server.rolePermissions")}>{entries.map((entry) => <li key={entry.id}><Check size={16} aria-hidden="true" />{entry.label}</li>)}</ul>;
}
