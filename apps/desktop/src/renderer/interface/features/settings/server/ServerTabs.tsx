import { useI18n } from '../../../shared/i18n';
import { Trash, Upload } from '@phosphor-icons/react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { inviteWebUrl } from '@discordy/core/domain/inviteLinks';
import { AUDIT_FILTERS, DEFAULT_MEMBER_FILTER, canPruneMembers, filterBans, filterMembers, isMemberAuditEntry, isTimedOut, type MemberFilter, type MemberSort } from '@discordy/core/domain/moderationTools';
import { timestampOf } from '@discordy/core/domain/snowflake';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
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
import { AUDIT_ACTIONS } from '@discordy/core/domain/auditActions';
import { ServerAuditPolicy } from './ServerAuditPolicy';

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
  const { t: msg } = useI18n();
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const cdn = useConnectionStore((s) => s.cdnUrl);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!guild) return null;

  const upload = async (file: File) => {
    setBusy(true);
    const name = file.name.replace(/\.[^.]+$/, '').replace(/\W+/g, '_').slice(0, 32) || 'emoji';
    const created = await attempt(async () => getRuntime().api.createEmoji(guildId, { name, image: await readAsDataUrl(file) }), msg("settings.servertabs.could.not.upload.emoji"));
    setBusy(false);
    if (created) useGuildStore.getState().setEmojis(guildId, [...guild.emojis, created]);
  };

  return (
    <Page title={msg("composer.emoji")} sub={msg("settings.servertabs.custom.emoji.everyone.in.the.server.can.use")}>
      <Button variant="primary" icon={<Upload size={15} />} loading={busy} onClick={() => fileRef.current?.click()}>{msg("settings.servertabs.upload.emoji")}</Button>
      <input ref={fileRef} type="file" accept="image/png,image/gif,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
      {guild.emojis.length === 0 ? (
        <EmptyState icon={<Upload size={32} weight="light" />} title={msg("settings.servertabs.no.custom.emoji")} body={msg("settings.servertabs.upload.png.gif.or.webp.images.up.to.256")} />
      ) : (
        <ul className="emoji-manage">
          {guild.emojis.map((e) => (
            <li key={e.id}>
              <img src={`${cdn}/emojis/${e.id}.${e.animated ? 'gif' : 'png'}`} alt={e.name ?? ''} />
              <Input aria-label={msg("server.emojiName", { name: e.name ?? "" })} defaultValue={e.name ?? ''} onBlur={(ev) => { const next = ev.target.value.trim(); if (next && next !== e.name && e.id) void attempt(async () => { const u = await getRuntime().api.updateEmoji(guildId, e.id!, { name: next }); useGuildStore.getState().setEmojis(guildId, guild.emojis.map((x) => (x.id === e.id ? u : x))); }, msg("settings.servertabs.could.not.rename.emoji")); }} />
              <IconButton label={msg("common.deleteNamed", { name: e.name ?? "" })} tone="danger" onClick={() => e.id && void attempt(async () => { await getRuntime().api.deleteEmoji(guildId, e.id!); useGuildStore.getState().setEmojis(guildId, guild.emojis.filter((x) => x.id !== e.id)); }, msg("settings.servertabs.could.not.delete.emoji"))}><Trash size={18} /></IconButton>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

export function ServerMembers({ guildId }: { guildId: string }) {
  const { t: msg, locale } = useI18n();
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
  const bulk = (verb: 'kick' | 'ban') => openDialog({
    kind: 'confirm',
    title: msg(verb === "ban" ? "server.bulkBanTitle" : "server.bulkKickTitle", { count: chosen.length }),
    body: verb === "ban" ? msg("settings.servertabs.they.are.removed.and.cannot.rejoin.until.unbanned") : msg("settings.servertabs.they.can.rejoin.with.a.new.invite"),
    confirmLabel: msg(verb === "ban" ? "settings.servertabs.ban" : "settings.servertabs.kick"),
    danger: true,
    onConfirm: async () => {
      let done = 0;
      for (const id of chosen) {
        const ok = await attempt(async () => {
          if (verb === "kick") await getRuntime().api.kickMember(guildId, id);
          else await getRuntime().api.ban(guildId, id);
          return true;
        }, msg(verb === "ban" ? "server.bulkBanError" : "server.bulkKickError"));
        if (ok) done += 1;
      }
      setSelected(new Set());
      useUiStore.getState().toast({ tone: 'info', title: msg(verb === "ban" ? "server.bulkBanDone" : "server.bulkKickDone", { done, count: chosen.length }) });
    },
  });
  return (
    <Page title={msg("settings.servertabs.members")} sub={msg("server.memberCount", { shown: list.length, count: all.length })}>
      {canPruneMembers(perms, guild.prune_admin_only ?? false) && <div className="row"><Button size="sm" onClick={() => openDialog({ kind: 'prune', guildId })}>{msg("settings.servertabs.prune.members")}</Button></div>}
      <div className="member-filters row">
        <Input aria-label={msg("settings.roleseditor.search.members")} placeholder={msg("settings.roleseditor.search.members")} value={filter.query} onChange={(e) => patch({ query: e.target.value })} />
        <Select aria-label={msg("settings.servertabs.filter.by.role")} value={filter.roleId} onChange={(e) => patch({ roleId: e.target.value })}>
          <option value="">{msg("settings.servertabs.all.roles")}</option>
          {assignable.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
        <Select aria-label={msg("settings.servertabs.sort.members")} value={filter.sort} onChange={(e) => patch({ sort: e.target.value as MemberSort })}>
          <option value="name">{msg("settings.servertabs.name")}</option>
          <option value="joined-newest">{msg("settings.servertabs.newest.members")}</option>
          <option value="joined-oldest">{msg("settings.servertabs.oldest.members")}</option>
        </Select>
        <label className="check-row"><input type="checkbox" checked={filter.timedOutOnly} onChange={(e) => patch({ timedOutOnly: e.target.checked })} /> {msg("settings.servertabs.timed.out")}</label>
      </div>
      {chosen.length > 0 && (
        <div className="save-bar glass" role="status">
          <span>{msg("server.selectedCount", { count: chosen.length })}</span>
          <Button variant="ghost" onClick={() => setSelected(new Set())}>{msg("settings.usertabs.clear")}</Button>
          <Button variant="danger" onClick={() => bulk('kick')}>{msg("settings.servertabs.kick")}</Button>
          <Button variant="danger" onClick={() => bulk('ban')}>{msg("settings.servertabs.ban")}</Button>
        </div>
      )}
      {selectable.length > 0 && (
        <label className="check-row"><input type="checkbox" aria-label={msg("settings.servertabs.select.all.shown")} checked={selectable.every((m) => selected.has(m.user.id))} onChange={(e) => setSelected(e.target.checked ? new Set(selectable.map((m) => m.user.id)) : new Set())} /> {msg("settings.servertabs.select.all.shown")}</label>
      )}
      <ul className="manage-list">
        {shown.map((m) => (
          <li key={m.user.id}>
            {m.user.id !== guild.owner_id && m.user.id !== me && <input type="checkbox" aria-label={msg("common.selectNamed", { name: m.user.username })} checked={selected.has(m.user.id)} onChange={() => toggle(m.user.id)} />}
            <Avatar id={m.user.id} name={displayName(m.user, m.nick)} avatar={m.user.avatar} size={34} />
            <div className="manage-copy"><strong>{displayName(m.user, m.nick)}</strong><span className="mono">{msg(isTimedOut(m) ? "server.memberTimedOutJoined" : "server.memberJoined", { name: m.user.username, date: new Date(m.joined_at).toLocaleDateString(locale) })}</span></div>
            <Select aria-label={msg("server.addRoleTo", { name: m.user.username })} value="" onChange={(e) => { const rid = e.target.value; if (rid) void attempt(() => getRuntime().api.addMemberRole(guildId, m.user.id, rid), msg("settings.servertabs.could.not.add.role")); }}>
              <option value="">{msg("server.roleCountAdd", { count: m.roles.filter((r) => r !== guildId).length })}</option>
              {assignable.filter((r) => !m.roles.includes(r.id)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
            {guild.owner_id !== m.user.id && <Button size="sm" variant="ghost" onClick={() => openDialog({ kind: 'confirm', title: msg("server.kickNamed", { name: m.user.username }), body: msg("settings.servertabs.they.can.rejoin.with.a.new.invite"), confirmLabel: msg("settings.servertabs.kick"), danger: true, onConfirm: async () => void (await attempt(() => getRuntime().api.kickMember(guildId, m.user.id), msg("settings.servertabs.could.not.kick"))) })}>{msg("settings.servertabs.kick")}</Button>}
          </li>
        ))}
      </ul>
    </Page>
  );
}

export function ServerInvites({ guildId }: { guildId: string }) {
  const { t: msg, locale } = useI18n();
  const qc = useQueryClient();
  const apiUrl = useConnectionStore((c) => c.apiUrl);
  const invites = useQuery({ queryKey: ['guild', guildId, 'invites'], queryFn: () => getRuntime().api.guildInvites(guildId) });
  return (
    <Page title={msg("settings.servertabs.invites")} sub={msg("settings.servertabs.active.invite.links.for.this.server")}>
      {invites.isLoading ? <Loading /> : invites.data?.length === 0 ? <EmptyState icon={<Upload size={32} weight="light" />} title={msg("settings.servertabs.no.active.invites")} body={msg("settings.servertabs.create.one.from.any.channel")} /> : (
        <ul className="manage-list">
          {invites.data?.map((i) => (
            <li key={i.code}>
              <div className="manage-copy"><strong className="mono">{i.code}</strong><span>{[i.inviter ? msg("server.inviteBy", { name: displayName(i.inviter) }) : "", i.max_uses ? msg("server.inviteLimitedUses", { count: i.uses ?? 0, limit: i.max_uses }) : msg("server.inviteUses", { count: i.uses ?? 0 }), i.expires_at ? msg("server.inviteExpires", { date: new Date(i.expires_at).toLocaleString(locale) }) : msg("server.inviteNeverExpires")].filter(Boolean).join(" · ")}</span></div>
              <Button size="sm" onClick={() => void copyText(inviteWebUrl(i.code, apiUrl), msg("settings.servertabs.invite.link.copied"))}>{msg("settings.backupcodeslist.copy")}</Button>
              <IconButton label={msg("settings.servertabs.revoke.invite")} tone="danger" onClick={() => void attempt(async () => { await getRuntime().api.deleteInvite(i.code); await qc.invalidateQueries({ queryKey: ['guild', guildId, 'invites'] }); }, msg("settings.servertabs.could.not.revoke.invite"))}><Trash size={18} /></IconButton>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

export function ServerBans({ guildId }: { guildId: string }) {
  const { t: msg } = useI18n();
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const bans = useQuery({ queryKey: ['guild', guildId, 'bans'], queryFn: () => getRuntime().api.bans(guildId) });
  const shown = filterBans(bans.data ?? [], query);
  return (
    <Page title={msg("settings.servertabs.bans")} sub={msg("settings.servertabs.people.who.cannot.rejoin.until.unbanned")}>
      {(bans.data?.length ?? 0) > 0 && <Input aria-label={msg("settings.servertabs.search.bans")} placeholder={msg("settings.servertabs.search.by.name.id.or.reason")} value={query} onChange={(e) => setQuery(e.target.value)} />}
      {bans.isLoading ? <Loading /> : bans.data?.length === 0 ? <EmptyState icon={<Upload size={32} weight="light" />} title={msg("settings.servertabs.no.bans")} body={msg("settings.servertabs.nobody.is.banned.from.this.server")} /> : shown.length === 0 ? <EmptyState icon={<Upload size={32} weight="light" />} title={msg("settings.servertabs.no.matching.bans")} /> : (
        <ul className="manage-list">
          {shown.map((b) => (
            <li key={b.user.id}>
              <Avatar id={b.user.id} name={displayName(b.user)} avatar={b.user.avatar} size={34} />
              <div className="manage-copy"><strong>{displayName(b.user)}</strong><span>{b.reason ?? msg("settings.servertabs.no.reason.given")}</span></div>
              <Button size="sm" variant="ghost" onClick={() => useUiStore.getState().openDialog({ kind: 'modView', guildId, userId: b.user.id })}>{msg("settings.servertabs.mod.view")}</Button>
              <Button size="sm" onClick={() => void attempt(async () => { await getRuntime().api.unban(guildId, b.user.id); await qc.invalidateQueries({ queryKey: ['guild', guildId, 'bans'] }); }, msg("settings.servertabs.could.not.unban"))}>{msg("settings.servertabs.unban")}</Button>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

export function ServerAudit({ guildId, target }: { guildId: string; target?: { id: string; name: string } }) {
  const { t: msg, locale, catalogText } = useI18n();
  const auditEnabled = useGuildStore((s) => s.guilds[guildId]?.audit_log_enabled ?? true);
  const [actionType, setActionType] = useState('');
  const [actorId, setActorId] = useState('');
  const query = { limit: 100, ...(target ? { target_id: target.id } : {}), ...(actionType ? { action_type: Number(actionType) } : {}), ...(actorId ? { user_id: actorId } : {}) };
  const log = useInfiniteQuery({
    queryKey: ['guild', guildId, 'audit', actionType, actorId, target?.id],
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
    <Page title={msg("settings.servertabs.audit.log")} sub={msg("settings.servertabs.moderation.and.configuration.actions.newest.first")}>
      <ServerAuditPolicy key={guildId} guildId={guildId} />
      {target && <div className="row"><p>Showing entries for {target.name}.</p><Button size="sm" variant="ghost" onClick={() => useUiStore.getState().openSettings({ kind: 'server', guildId, tab: 'audit' })}>Clear target filter</Button></div>}
      <div className="member-filters row">
        <Select aria-label={msg("settings.servertabs.filter.by.action")} value={actionType} onChange={(e) => setActionType(e.target.value)}>
          <option value="">{msg("settings.servertabs.all.actions")}</option>
          {AUDIT_FILTERS.map((f) => <option key={f.value} value={f.value}>{catalogText(f.label)}</option>)}
        </Select>
        <Select aria-label={msg("settings.servertabs.filter.by.moderator")} value={actorId} onChange={(e) => setActorId(e.target.value)}>
          <option value="">{msg("settings.servertabs.everyone")}</option>
          {moderators.map((m) => <option key={m.user.id} value={m.user.id}>{displayName(m.user, m.nick)}</option>)}
        </Select>
      </div>
      {log.isLoading ? <Loading /> : log.isError ? <div><p className="field-error" role="alert">{msg("settings.servertabs.could.not.load.audit.entries")}</p><Button onClick={() => void log.refetch()}>{msg("common.retry")}</Button></div> : entries.length === 0 ? <EmptyState icon={<Upload size={32} weight="light" />} title={auditEnabled ? msg("settings.servertabs.no.matching.audit.entries") : msg("settings.servertabs.no.retained.audit.entries")} body={auditEnabled ? msg("settings.servertabs.new.actions.appear.here.when.they.match.your.filters") : msg("settings.servertabs.logging.is.off.changes.to.audit.settings.are.still")} /> : (
        <ul className="manage-list audit">
          {entries.map((e) => {
            const actor = e.user_id ? users.get(e.user_id) : undefined;
            return (
              <li key={e.id}>
                <Avatar id={actor?.id} name={actor ? displayName(actor) : '?'} avatar={actor?.avatar} size={30} />
                <div className="manage-copy"><strong>{msg("server.auditEvent", { name: actor ? displayName(actor) : catalogText("Unknown"), action: AUDIT_ACTIONS[e.action_type] ? catalogText(AUDIT_ACTIONS[e.action_type]!) : msg("server.auditUnknownAction", { action: e.action_type }) })}</strong>{e.reason && <span>{msg("settings.servertabs.reason")} {e.reason}</span>}</div>
                {isMemberAuditEntry(e) && <Button size="sm" variant="ghost" onClick={() => useUiStore.getState().openDialog({ kind: 'modView', guildId, userId: e.target_id as string })}>{msg("settings.servertabs.mod.view")}</Button>}
                <time className="tnum">{new Date(timestampOf(e.id)).toLocaleString(locale)}</time>
              </li>
            );
          })}
        </ul>
      )}
      {log.hasNextPage && <Button loading={log.isFetchingNextPage} onClick={() => void log.fetchNextPage()}>{msg("settings.servertabs.load.older.entries")}</Button>}
    </Page>
  );
}
