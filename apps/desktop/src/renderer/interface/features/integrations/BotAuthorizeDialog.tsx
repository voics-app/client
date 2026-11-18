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
  const signature = `${userId}:${info?.application.id}:${guildId}:${installed}:${permissions}:${info?.scopes.join(' ') ?? ''}`;
  const close = () => { if (!busy) useUiStore.getState().openDialog(null); };
  const submit = async () => {
    if (!guild || !info || confirmed !== signature) return;
    setBusy(true);
    setError(null);
    try {
      await getRuntime().api.authorizeBot({ client_id: request.client_id, guild_id: guild.id, scope: info.scopes.join(' '), permissions });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['authorizations', userId] }),
        qc.invalidateQueries({ queryKey: ['guild', guild.id, 'integrations'] }),
      ]);
      useUiStore.getState().openDialog(null);
      openGuild(guild.id);
      useUiStore.getState().toast({ tone: 'success', title: installed ? 'Consent recorded' : `${info.application.name} added to ${guild.name}` });
    } catch (reason) {
      setError(errorMessage(reason));
      // A lifecycle conflict needs a fresh view before consent can be retried.
      setConfirmed(null);
      void query.refetch();
    } finally { setBusy(false); }
  };
  return <Modal open onClose={close} title="Authorize application" width={520}>
    <div className="integration-stack">
      {query.isPending ? <p role="status">Loading application…</p> : query.isError ? <div><p role="alert" className="field-error">Could not load this application. {errorMessage(query.error)}</p><Button onClick={() => void query.refetch()}>Try again</Button></div> : info && <>
        <div className="integration-identity"><Avatar id={info.application.id} avatar={info.application.icon} name={info.application.name} kind="icons" size={48} square /><div><h3>{info.application.name}</h3><p>{info.application.description || 'An application bot for your server.'}</p></div></div>
        <ul className="integration-permissions" aria-label="Requested scopes">
          <li><Check size={16} aria-hidden="true" />Add a bot to a server you manage</li>
          {info.scopes.includes('applications.commands') && <li><Check size={16} aria-hidden="true" />Use application commands in that server</li>}
        </ul>
        {info.guilds.length === 0 ? <p>You need Manage Server permission in a server to authorize this application.</p> : <>
          <Field label="Server">{(id) => <Select id={id} value={guildId} disabled={busy} onChange={(event) => { setGuildId(event.target.value); setConfirmed(null); setError(null); }}><option value="">Choose a server</option>{info.guilds.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>}</Field>
          {guild && <section className="integration-permission-review" aria-label="Permission review">
            <h3>{installed ? 'Current bot permissions' : 'Requested permissions'}</h3>
            {installed && <p>This bot is already installed. You are acknowledging its current permissions; this does not change them.</p>}
            <PermissionChecklist permissions={permissions} />
            {!installed && <p className="field-hint">The bot also inherits this server’s everyone-role permissions.</p>}
            <label className="check-row"><input type="checkbox" checked={confirmed === signature} disabled={busy} onChange={(event) => setConfirmed(event.target.checked ? signature : null)} />I have reviewed these permissions.</label>
          </section>}
        </>}
      </>}
      {error && <p role="alert" className="field-error">Could not authorize. {error}</p>}
      <div className="row-end"><Button variant="ghost" disabled={busy} onClick={close}>Cancel</Button><Button variant="primary" loading={busy} disabled={!guild || confirmed !== signature || query.isError} onClick={() => void submit()}>{installed ? 'Record consent' : 'Authorize'}</Button></div>
    </div>
  </Modal>;
}

export function PermissionChecklist({ permissions }: { permissions: string }) {
  const entries = permissionChecklist(permissions);
  return entries.length === 0 ? <p className="field-hint">No additional permissions requested.</p> : <ul className="integration-permissions" aria-label="Permissions">{entries.map((entry) => <li key={entry.id}><Check size={16} aria-hidden="true" />{entry.label}</li>)}</ul>;
}
