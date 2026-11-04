import { Trash, Upload } from '@phosphor-icons/react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { inviteWebUrl } from '@renderer/domain/inviteLinks';
import { AUDIT_FILTERS, DEFAULT_MEMBER_FILTER, canPruneMembers, filterBans, filterMembers, isMemberAuditEntry, isTimedOut, type MemberFilter, type MemberSort } from '@discordy/core/domain/moderationTools';
import { timestampOf } from '@discordy/core/domain/snowflake';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { useGuildPermissions } from '../../../shared/hooks/usePermissions';
import { attempt, copyText } from '../../../app/actions';
import { useConnectionStore } from '../../../app/connectionStore';
import { getRuntime } from '../../../app/runtime';
import { displayName } from '../../../shared/hooks/useNames';
import { Avatar } from '../../../shared/ui/Avatar';
import { Button } from '../../../shared/ui/Button';
import { Input, Select } from '../../../shared/ui/Form';
import { IconButton } from '../../../shared/ui/IconButton';
import { EmptyState, Skeleton } from '../../../shared/ui/Misc';
import { readAsDataUrl } from '../imageUpload';
import { AUDIT_ACTIONS } from './auditActions';

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
  const me = useSessionStore((s) => s.user?.id);
  const [filter, setFilter] = useState<MemberFilter>(DEFAULT_MEMBER_FILTER);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const openDialog = useUiStore((s) => s.openDialog);
  const perms = useGuildPermissions(guildId);
  const all = useMemo(() => Object.values(members ?? {}), [members]);
  const list = useMemo(() => filterMembers(all, filter, (m) => displayName(m.user, m.nick)), [all, filter]);
  if (!guild) return null;
  const assignable = guild.roles.filter((r) => r.id !== guildId && !r.managed);
  const patch = (next: Partial<MemberFilter>) => setFilter((f) => ({ ...f, ...next }));
  const shown = list.slice(0, 200);
  const selectable = shown.filter((m) => m.user.id !== guild.owner_id && m.user.id !== me);
  const chosen = [...selected].filter((id) => all.some((m) => m.user.id === id));
  const toggle = (id: string) => setSelected((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const bulk = (verb: 'Kick' | 'Ban') => openDialog({
    kind: 'confirm',
    title: `${verb} ${chosen.length} member${chosen.length === 1 ? '' : 's'}?`,
    body: verb === 'Ban' ? 'They are removed and cannot rejoin until unbanned.' : 'They can rejoin with a new invite.',
    confirmLabel: verb,
    danger: true,
    onConfirm: async () => {
      let done = 0;
      for (const id of chosen) {
        const ok = await attempt(async () => {
          if (verb === 'Kick') await getRuntime().api.kickMember(guildId, id);
          else await getRuntime().api.ban(guildId, id);
          return true;
        }, `Could not ${verb.toLowerCase()} a member`);
        if (ok) done += 1;
      }
      setSelected(new Set());
      useUiStore.getState().toast({ tone: 'info', title: `${verb} finished for ${done} of ${chosen.length}` });
    },
  });
  return (
    <Page title="Members" sub={`${list.length} of ${all.length} members`}>
      {canPruneMembers(perms, guild.prune_admin_only ?? false) && <div className="row"><Button size="sm" onClick={() => openDialog({ kind: 'prune', guildId })}>Prune members</Button></div>}
      <div className="member-filters row">
        <Input aria-label="Search members" placeholder="Search members" value={filter.query} onChange={(e) => patch({ query: e.target.value })} />
        <Select aria-label="Filter by role" value={filter.roleId} onChange={(e) => patch({ roleId: e.target.value })}>
          <option value="">All roles</option>
          {assignable.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
        <Select aria-label="Sort members" value={filter.sort} onChange={(e) => patch({ sort: e.target.value as MemberSort })}>
          <option value="name">Name</option>
          <option value="joined-newest">Newest members</option>
          <option value="joined-oldest">Oldest members</option>
        </Select>
        <label className="check-row"><input type="checkbox" checked={filter.timedOutOnly} onChange={(e) => patch({ timedOutOnly: e.target.checked })} /> Timed out</label>
      </div>
      {chosen.length > 0 && (
        <div className="save-bar glass" role="status">
          <span>{chosen.length} selected</span>
          <Button variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          <Button variant="danger" onClick={() => bulk('Kick')}>Kick</Button>
          <Button variant="danger" onClick={() => bulk('Ban')}>Ban</Button>
        </div>
      )}
      {selectable.length > 0 && (
        <label className="check-row"><input type="checkbox" aria-label="Select all shown" checked={selectable.every((m) => selected.has(m.user.id))} onChange={(e) => setSelected(e.target.checked ? new Set(selectable.map((m) => m.user.id)) : new Set())} /> Select all shown</label>
      )}
      <ul className="manage-list">
        {shown.map((m) => (
          <li key={m.user.id}>
            {m.user.id !== guild.owner_id && m.user.id !== me && <input type="checkbox" aria-label={`Select ${m.user.username}`} checked={selected.has(m.user.id)} onChange={() => toggle(m.user.id)} />}
            <Avatar id={m.user.id} name={displayName(m.user, m.nick)} avatar={m.user.avatar} size={34} />
            <div className="manage-copy"><strong>{displayName(m.user, m.nick)}</strong><span className="mono">{m.user.username}{isTimedOut(m) ? ' · timed out' : ''} · joined {new Date(m.joined_at).toLocaleDateString()}</span></div>
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
  const [query, setQuery] = useState('');
  const bans = useQuery({ queryKey: ['guild', guildId, 'bans'], queryFn: () => getRuntime().api.bans(guildId) });
  const shown = filterBans(bans.data ?? [], query);
  return (
    <Page title="Bans" sub="People who cannot rejoin until unbanned.">
      {(bans.data?.length ?? 0) > 0 && <Input aria-label="Search bans" placeholder="Search by name, ID or reason" value={query} onChange={(e) => setQuery(e.target.value)} />}
      {bans.isLoading ? <Loading /> : bans.data?.length === 0 ? <EmptyState icon={<Upload size={32} weight="light" />} title="No bans" body="Nobody is banned from this server." /> : shown.length === 0 ? <EmptyState icon={<Upload size={32} weight="light" />} title="No matching bans" /> : (
        <ul className="manage-list">
          {shown.map((b) => (
            <li key={b.user.id}>
              <Avatar id={b.user.id} name={displayName(b.user)} avatar={b.user.avatar} size={34} />
              <div className="manage-copy"><strong>{displayName(b.user)}</strong><span>{b.reason ?? 'No reason given'}</span></div>
              <Button size="sm" variant="ghost" onClick={() => useUiStore.getState().openDialog({ kind: 'modView', guildId, userId: b.user.id })}>Mod View</Button>
              <Button size="sm" onClick={() => void attempt(async () => { await getRuntime().api.unban(guildId, b.user.id); await qc.invalidateQueries({ queryKey: ['guild', guildId, 'bans'] }); }, 'Could not unban')}>Unban</Button>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

export function ServerAudit({ guildId }: { guildId: string }) {
  const [actionType, setActionType] = useState('');
  const [actorId, setActorId] = useState('');
  const query = { limit: 100, ...(actionType ? { action_type: Number(actionType) } : {}), ...(actorId ? { user_id: actorId } : {}) };
  const log = useInfiniteQuery({
    queryKey: ['guild', guildId, 'audit', actionType, actorId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => getRuntime().api.auditLog(guildId, { ...query, before: pageParam }),
    getNextPageParam: (last) => (last.audit_log_entries.length >= 100 ? last.audit_log_entries[last.audit_log_entries.length - 1]?.id : undefined),
  });
  const pages = log.data?.pages ?? [];
  const entries = pages.flatMap((p) => p.audit_log_entries);
  const users = new Map(pages.flatMap((p) => p.users ?? []).map((u) => [u.id, u]));
  const members = useGuildStore((s) => s.members[guildId]);
  const moderators = Object.values(members ?? {});
  return (
    <Page title="Audit log" sub="Moderation and configuration actions, newest first.">
      <div className="member-filters row">
        <Select aria-label="Filter by action" value={actionType} onChange={(e) => setActionType(e.target.value)}>
          <option value="">All actions</option>
          {AUDIT_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </Select>
        <Select aria-label="Filter by moderator" value={actorId} onChange={(e) => setActorId(e.target.value)}>
          <option value="">Everyone</option>
          {moderators.map((m) => <option key={m.user.id} value={m.user.id}>{displayName(m.user, m.nick)}</option>)}
        </Select>
      </div>
      {log.isLoading ? <Loading /> : entries.length === 0 ? <EmptyState icon={<Upload size={32} weight="light" />} title="Nothing logged yet" /> : (
        <ul className="manage-list audit">
          {entries.map((e) => {
            const actor = e.user_id ? users.get(e.user_id) : undefined;
            return (
              <li key={e.id}>
                <Avatar id={actor?.id} name={actor ? displayName(actor) : '?'} avatar={actor?.avatar} size={30} />
                <div className="manage-copy"><strong>{actor ? displayName(actor) : 'Unknown'} {AUDIT_ACTIONS[e.action_type] ?? `performed action ${e.action_type}`}</strong>{e.reason && <span>Reason: {e.reason}</span>}</div>
                {isMemberAuditEntry(e) && <Button size="sm" variant="ghost" onClick={() => useUiStore.getState().openDialog({ kind: 'modView', guildId, userId: e.target_id as string })}>Mod View</Button>}
                <time className="tnum">{new Date(timestampOf(e.id)).toLocaleString()}</time>
              </li>
            );
          })}
        </ul>
      )}
      {log.hasNextPage && <Button loading={log.isFetchingNextPage} onClick={() => void log.fetchNextPage()}>Load older entries</Button>}
    </Page>
  );
}
