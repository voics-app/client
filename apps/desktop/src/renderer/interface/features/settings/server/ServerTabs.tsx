import { Trash, Upload } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import { inviteWebUrl } from '@renderer/domain/inviteLinks';
import { timestampOf } from '@renderer/domain/snowflake';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { attempt, copyText } from '../../../app/actions';
import { useConnectionStore } from '../../../app/connectionStore';
import { getRuntime } from '../../../app/runtime';
import { displayName } from '../../../shared/hooks/useNames';
import { Avatar } from '../../../shared/ui/Avatar';
import { Button } from '../../../shared/ui/Button';
import { Field, Input, Select, TextArea } from '../../../shared/ui/Form';
import { IconButton } from '../../../shared/ui/IconButton';
import { EmptyState, Skeleton } from '../../../shared/ui/Misc';
import { readAsDataUrl, readImageUpload } from '../imageUpload';

function Page({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="settings-page">
      <h1>{title}</h1>
      {sub && <p className="page-sub">{sub}</p>}
      {children}
    </div>
  );
}

function Loading() {
  return <div className="list-loading">{[0, 1, 2].map((i) => <Skeleton key={i} height={44} radius={12} />)}</div>;
}

export function ServerOverview({ guildId }: { guildId: string }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const [name, setName] = useState(guild?.name ?? '');
  const [description, setDescription] = useState(guild?.description ?? '');
  const [region, setRegion] = useState(guild?.voice_region ?? '');
  const [icon, setIcon] = useState<string | null | undefined>(undefined);
  const [iconError, setIconError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const regions = useQuery({ queryKey: ['voice', 'regions'], queryFn: () => getRuntime().api.voiceRegions(), staleTime: 300_000 });
  if (!guild) return null;
  const dirty = name !== guild.name || description !== (guild.description ?? '') || region !== (guild.voice_region ?? '') || icon !== undefined;

  const chooseIcon = async (file: File | undefined) => {
    if (!file) return;
    try {
      setIcon(await readImageUpload(file));
      setIconError(null);
    } catch (error) {
      setIconError(error instanceof Error ? error.message : 'Could not read the image.');
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await attempt(() => getRuntime().api.updateGuild(guildId, { name, description: description || null, voice_region: region || null, ...(icon !== undefined ? { icon } : {}) }), 'Could not save server');
      if (updated) {
        useGuildStore.getState().patchGuild({ ...updated, id: guildId });
        setIcon(undefined);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page title="Server overview" sub="Name, icon and where voice runs.">
      <div className="overview-row">
        <button type="button" className="icon-upload" onClick={() => fileRef.current?.click()} aria-label="Change server icon">
          {icon ? <img src={icon} alt="" /> : <Avatar id={guild.id} name={guild.name} avatar={guild.icon} size={96} square kind="icons" />}
          <span><Upload size={18} /> Change</span>
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => void chooseIcon(e.target.files?.[0])} />
        {iconError && <p className="field-error" role="alert">{iconError}</p>}
        <div className="stack grow">
          <Field label="Server name">{(id) => <Input id={id} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label="Description">{(id) => <TextArea id={id} value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />}</Field>
          <Field label="Voice region" hint="Everyone in a call shares one voice node in this region.">
            {(id) => (
              <Select id={id} value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="">Automatic</option>
                {regions.data?.map((r) => <option key={r.id} value={r.id}>{r.name}{r.optimal ? ' (recommended)' : ''}</option>)}
              </Select>
            )}
          </Field>
        </div>
      </div>
      {dirty && (
        <div className="save-bar glass" role="status">
          <span>You have unsaved changes.</span>
          <Button variant="ghost" onClick={() => { setName(guild.name); setDescription(guild.description ?? ''); setRegion(guild.voice_region ?? ''); setIcon(undefined); }}>Reset</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>Save changes</Button>
        </div>
      )}
    </Page>
  );
}

export function ServerEmoji({ guildId }: { guildId: string }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const cdn = useConnectionStore((s) => s.cdnUrl);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!guild) return null;

  const upload = async (file: File) => {
    setBusy(true);
    const name = file.name.replace(/\.[^.]+$/, '').replace(/\W+/g, '_').slice(0, 32) || 'emoji';
    const created = await attempt(async () => getRuntime().api.createEmoji(guildId, { name, image: await readAsDataUrl(file) }), 'Could not upload emoji');
    setBusy(false);
    if (created) useGuildStore.getState().setEmojis(guildId, [...guild.emojis, created]);
  };

  return (
    <Page title="Emoji" sub="Custom emoji everyone in the server can use.">
      <Button variant="primary" icon={<Upload size={15} />} loading={busy} onClick={() => fileRef.current?.click()}>Upload emoji</Button>
      <input ref={fileRef} type="file" accept="image/png,image/gif,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
      {guild.emojis.length === 0 ? (
        <EmptyState icon={<Upload size={32} weight="light" />} title="No custom emoji" body="Upload PNG, GIF or WebP images up to 256 KB." />
      ) : (
        <ul className="emoji-manage">
          {guild.emojis.map((e) => (
            <li key={e.id}>
              <img src={`${cdn}/emojis/${e.id}.${e.animated ? 'gif' : 'png'}`} alt={e.name ?? ''} />
              <Input aria-label={`Name of ${e.name}`} defaultValue={e.name ?? ''} onBlur={(ev) => { const next = ev.target.value.trim(); if (next && next !== e.name && e.id) void attempt(async () => { const u = await getRuntime().api.updateEmoji(guildId, e.id!, { name: next }); useGuildStore.getState().setEmojis(guildId, guild.emojis.map((x) => (x.id === e.id ? u : x))); }, 'Could not rename emoji'); }} />
              <IconButton label={`Delete ${e.name}`} tone="danger" onClick={() => e.id && void attempt(async () => { await getRuntime().api.deleteEmoji(guildId, e.id!); useGuildStore.getState().setEmojis(guildId, guild.emojis.filter((x) => x.id !== e.id)); }, 'Could not delete emoji')}><Trash size={18} /></IconButton>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

export function ServerMembers({ guildId }: { guildId: string }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const members = useGuildStore((s) => s.members[guildId]);
  const [query, setQuery] = useState('');
  const openDialog = useUiStore((s) => s.openDialog);
  if (!guild) return null;
  const list = Object.values(members ?? {}).filter((m) => displayName(m.user, m.nick).toLowerCase().includes(query.toLowerCase()));
  const assignable = guild.roles.filter((r) => r.id !== guildId && !r.managed);
  return (
    <Page title="Members" sub={`${Object.keys(members ?? {}).length} members`}>
      <Input aria-label="Search members" placeholder="Search members" value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul className="manage-list">
        {list.slice(0, 200).map((m) => (
          <li key={m.user.id}>
            <Avatar id={m.user.id} name={displayName(m.user, m.nick)} avatar={m.user.avatar} size={34} />
            <div className="manage-copy"><strong>{displayName(m.user, m.nick)}</strong><span className="mono">{m.user.username}</span></div>
            <Select aria-label={`Add role to ${m.user.username}`} value="" onChange={(e) => { const rid = e.target.value; if (rid) void attempt(() => getRuntime().api.addMemberRole(guildId, m.user.id, rid), 'Could not add role'); }}>
              <option value="">{m.roles.filter((r) => r !== guildId).length} roles, add</option>
              {assignable.filter((r) => !m.roles.includes(r.id)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
            {guild.owner_id !== m.user.id && <Button size="sm" variant="ghost" onClick={() => openDialog({ kind: 'confirm', title: `Kick ${m.user.username}?`, body: 'They can rejoin with a new invite.', confirmLabel: 'Kick', danger: true, onConfirm: async () => void (await attempt(() => getRuntime().api.kickMember(guildId, m.user.id), 'Could not kick')) })}>Kick</Button>}
          </li>
        ))}
      </ul>
    </Page>
  );
}

export function ServerInvites({ guildId }: { guildId: string }) {
  const qc = useQueryClient();
  const apiUrl = useConnectionStore((c) => c.apiUrl);
  const invites = useQuery({ queryKey: ['guild', guildId, 'invites'], queryFn: () => getRuntime().api.guildInvites(guildId) });
  return (
    <Page title="Invites" sub="Active invite links for this server.">
      {invites.isLoading ? <Loading /> : invites.data?.length === 0 ? <EmptyState icon={<Upload size={32} weight="light" />} title="No active invites" body="Create one from any channel." /> : (
        <ul className="manage-list">
          {invites.data?.map((i) => (
            <li key={i.code}>
              <div className="manage-copy"><strong className="mono">{i.code}</strong><span>{i.inviter ? `by ${displayName(i.inviter)}` : ''} · {i.uses ?? 0}{i.max_uses ? `/${i.max_uses}` : ''} uses{i.expires_at ? ` · expires ${new Date(i.expires_at).toLocaleString()}` : ' · never expires'}</span></div>
              <Button size="sm" onClick={() => void copyText(inviteWebUrl(i.code, apiUrl), 'Invite link copied')}>Copy</Button>
              <IconButton label="Revoke invite" tone="danger" onClick={() => void attempt(async () => { await getRuntime().api.deleteInvite(i.code); await qc.invalidateQueries({ queryKey: ['guild', guildId, 'invites'] }); }, 'Could not revoke invite')}><Trash size={18} /></IconButton>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

export function ServerBans({ guildId }: { guildId: string }) {
  const qc = useQueryClient();
  const bans = useQuery({ queryKey: ['guild', guildId, 'bans'], queryFn: () => getRuntime().api.bans(guildId) });
  return (
    <Page title="Bans" sub="People who cannot rejoin until unbanned.">
      {bans.isLoading ? <Loading /> : bans.data?.length === 0 ? <EmptyState icon={<Upload size={32} weight="light" />} title="No bans" body="Nobody is banned from this server." /> : (
        <ul className="manage-list">
          {bans.data?.map((b) => (
            <li key={b.user.id}>
              <Avatar id={b.user.id} name={displayName(b.user)} avatar={b.user.avatar} size={34} />
              <div className="manage-copy"><strong>{displayName(b.user)}</strong><span>{b.reason ?? 'No reason given'}</span></div>
              <Button size="sm" onClick={() => void attempt(async () => { await getRuntime().api.unban(guildId, b.user.id); await qc.invalidateQueries({ queryKey: ['guild', guildId, 'bans'] }); }, 'Could not unban')}>Unban</Button>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

const AUDIT_ACTIONS: Record<number, string> = {
  1: 'updated the server', 10: 'created a channel', 11: 'updated a channel', 12: 'deleted a channel', 13: 'created a permission overwrite', 14: 'updated a permission overwrite', 15: 'deleted a permission overwrite',
  20: 'kicked a member', 22: 'banned a member', 23: 'unbanned a member', 24: 'updated a member', 25: 'updated a member’s roles', 30: 'created a role', 31: 'updated a role', 32: 'deleted a role',
  40: 'created an invite', 42: 'deleted an invite', 60: 'created an emoji', 61: 'updated an emoji', 62: 'deleted an emoji', 72: 'deleted a message', 73: 'bulk-deleted messages', 74: 'pinned a message', 75: 'unpinned a message',
};

export function ServerAudit({ guildId }: { guildId: string }) {
  const log = useQuery({ queryKey: ['guild', guildId, 'audit'], queryFn: () => getRuntime().api.auditLog(guildId, { limit: 100 }) });
  const users = new Map((log.data?.users ?? []).map((u) => [u.id, u]));
  return (
    <Page title="Audit log" sub="The last 100 moderation and configuration actions.">
      {log.isLoading ? <Loading /> : log.data?.audit_log_entries.length === 0 ? <EmptyState icon={<Upload size={32} weight="light" />} title="Nothing logged yet" /> : (
        <ul className="manage-list audit">
          {log.data?.audit_log_entries.map((e) => {
            const actor = e.user_id ? users.get(e.user_id) : undefined;
            return (
              <li key={e.id}>
                <Avatar id={actor?.id} name={actor ? displayName(actor) : '?'} avatar={actor?.avatar} size={30} />
                <div className="manage-copy"><strong>{actor ? displayName(actor) : 'Unknown'} {AUDIT_ACTIONS[e.action_type] ?? `performed action ${e.action_type}`}</strong>{e.reason && <span>Reason: {e.reason}</span>}</div>
                <time className="tnum">{new Date(timestampOf(e.id)).toLocaleString()}</time>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
