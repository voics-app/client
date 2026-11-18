import { CaretDown, CaretRight, Crown, MagnifyingGlass, SpeakerHigh } from '@phosphor-icons/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { usePresenceStore } from '@discordy/core/application/stores/peopleStores';
import { useMemberGroupStore } from '@discordy/core/application/stores/memberGroupStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { assetCandidates } from '@discordy/core/domain/assets';
import { flattenSections, roleIconOf, voiceChannelOf, searchMembers, VIRTUALISE_ABOVE, type MemberRow as Row } from '@discordy/core/domain/memberList';
import { buildMemberSections } from '@discordy/core/domain/memberModeration';
import { GatewayOp } from '@discordy/core/contracts/gateway';
import type { GuildMember, Role } from '@discordy/core/contracts/rest';
import { getRuntime } from '../../app/runtime';
import { displayName } from '../../shared/hooks/useNames';
import { useConnectionStore } from '../../app/connectionStore';
import { StatusLine } from './StatusLine';
import { UserAvatar } from '../../shared/ui/UserAvatar';
import { AppTag } from '../../shared/ui/AppTag';
import { AssetImage } from '../../shared/ui/AssetImage';
import { RoleDot, useRoleColorDisplay } from '../../shared/ui/RoleDot';
import { useMenu } from '../../shared/ui/Menu';
import { useRovingFocus } from '../../shared/hooks/useRovingFocus';
import { RolePills } from './RolePills';
import { UserContextMenu } from './UserContextMenu';

const HOVER_DELAY_MS = 350;
const SEARCH_DEBOUNCE_MS = 250;
const MEMBER_ROW_PX = 44;
const HEADER_ROW_PX = 36;

function roleColor(guildRoles: { id: string; color: number; position: number }[] | undefined, member: GuildMember): string | undefined {
  const top = guildRoles?.filter((r) => member.roles.includes(r.id) && r.color !== 0).sort((a, b) => b.position - a.position)[0];
  return top ? `#${top.color.toString(16).padStart(6, '0')}` : undefined;
}

function RoleIcon({ role }: { role: Role }) {
  const cdn = useConnectionStore((s) => s.cdnUrl);
  return (
    <span className='member-role-icon' title={role.name} role='img' aria-label={role.name}>
      {role.icon ? <AssetImage candidates={assetCandidates(cdn, 'role-icons', role.id, role.icon, 32)} /> : <span aria-hidden>{role.unicode_emoji}</span>}
    </span>
  );
}

function VoiceIndicator({ guildId, userId }: { guildId: string; userId: string }) {
  const channelId = useVoiceStore((s) => voiceChannelOf(s.states[guildId], userId));
  const channelName = useGuildStore((s) => (channelId ? s.channels[channelId]?.name : undefined));
  if (!channelId) return null;
  const label = channelName ? `In voice: ${channelName}` : 'In voice';
  return (
    <span className='member-voice' title={label} role='img' aria-label={label}>
      <SpeakerHigh size={14} weight='fill' />
    </span>
  );
}

function OwnerCrown() {
  return (
    <span className='member-crown' title='Server Owner' role='img' aria-label='Server owner'>
      <Crown size={14} weight='fill' />
    </span>
  );
}

function HoverCard({ guildId, member, anchor }: { guildId: string; member: GuildMember; anchor: DOMRect }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const presence = usePresenceStore((s) => s.byUser[member.user.id]);
  const status = presence?.status ?? 'offline';
  const name = displayName(member.user, member.nick);
  const top = Math.max(8, Math.min(anchor.top, window.innerHeight - 220));
  return createPortal(
    <div className='member-hover-card' role='tooltip' style={{ left: anchor.left - 8, top }}>
      <div className='member-hover-head'>
        <UserAvatar id={member.user.id} name={name} avatar={member.user.avatar} guildId={guildId} member={member} size={56} status={status} />
        <div className='member-hover-names'>
          <strong style={{ color: roleColor(guild?.roles, member) }}>{name}</strong>
          <span className='member-hover-user'>
            {member.user.username}
            {member.user.bot && <AppTag />}
          </span>
        </div>
        {guild?.owner_id === member.user.id && <OwnerCrown />}
      </div>
      <StatusLine className='member-hover-activity' activities={presence?.activities} />
      <RolePills guildId={guildId} userId={member.user.id} />
    </div>,
    document.body,
  );
}

function MemberRow({ guildId, member }: { guildId: string; member: GuildMember }) {
  const presence = usePresenceStore((s) => s.byUser[member.user.id]);
  const status = presence?.status ?? 'offline';
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const openDialog = useUiStore((s) => s.openDialog);
  const menu = useMenu();
  const name = displayName(member.user, member.nick);
  const roleStyle = useRoleColorDisplay(roleColor(guild?.roles, member));
  const isOwner = guild?.owner_id === member.user.id;
  const roleIcon = roleIconOf(guild?.roles, member);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = (el: HTMLElement) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAnchor(el.getBoundingClientRect()), HOVER_DELAY_MS);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setAnchor(null);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <>
      <button
        type='button'
        className={`member-row${status === 'offline' ? ' is-offline' : ''}`}
        onClick={() => {
          hide();
          openDialog({ kind: 'profile', userId: member.user.id, guildId });
        }}
        onContextMenu={(e) => {
          hide();
          menu.openAt(e);
        }}
        onMouseEnter={(e) => show(e.currentTarget)}
        onMouseLeave={hide}
        onFocus={(e) => show(e.currentTarget)}
        onBlur={hide}
      >
        <UserAvatar id={member.user.id} name={name} avatar={member.user.avatar} guildId={guildId} member={member} size={32} status={status} />
        <span className='member-copy'>
          <span className='member-name-line'>
            <span className='member-name' style={roleStyle.tint ? { color: roleStyle.tint } : undefined}>
              <RoleDot color={roleStyle.dot} />
              {name}
            </span>
            {roleIcon && <RoleIcon role={roleIcon} />}
            {isOwner && <OwnerCrown />}
            {member.user.bot && <AppTag />}
          </span>
          <StatusLine className='member-activity' activities={presence?.activities} />
        </span>
        <VoiceIndicator guildId={guildId} userId={member.user.id} />
      </button>
      {anchor && <HoverCard guildId={guildId} member={member} anchor={anchor} />}
      <UserContextMenu userId={member.user.id} name={name} guildId={guildId} menu={menu} />
    </>
  );
}

function GroupHeader({ row, onToggle }: { row: Extract<Row, { kind: 'header' }>; onToggle: (id: string) => void }) {
  return (
    <h3 className='members-heading'>
      <button type='button' className='members-heading-btn' aria-expanded={!row.collapsed} onClick={() => onToggle(row.id)}>
        {row.collapsed ? <CaretRight size={10} weight='bold' /> : <CaretDown size={10} weight='bold' />}
        <span>{row.title}</span>
        <span className='tnum'>{row.count}</span>
      </button>
    </h3>
  );
}

function RowView({ row, guildId, onToggle }: { row: Row; guildId: string; onToggle: (id: string) => void }) {
  return row.kind === 'header' ? <GroupHeader row={row} onToggle={onToggle} /> : <MemberRow guildId={guildId} member={row.member} />;
}

export function MemberList({ guildId }: { guildId: string }) {
  const members = useGuildStore((s) => s.members[guildId]);
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const presence = usePresenceStore((s) => s.byUser);
  const [query, setQuery] = useState('');
  const collapsedIds = useMemberGroupStore((s) => s.collapsed[guildId]);
  const toggleGroup = useMemberGroupStore((s) => s.toggle);
  const collapsed = useMemo<ReadonlySet<string>>(() => new Set(collapsedIds ?? []), [collapsedIds]);

  useEffect(() => {
    getRuntime().gateway.send(GatewayOp.REQUEST_GUILD_MEMBERS, {
      guild_id: guildId,
      query: '',
      limit: 100,
      presences: true,
      nonce: `members-${guildId}`,
    });
    setQuery('');
  }, [guildId]);

  const needle = query.trim();
  useEffect(() => {
    if (!needle) return;
    const t = window.setTimeout(() => {
      getRuntime().gateway.send(GatewayOp.REQUEST_GUILD_MEMBERS, {
        guild_id: guildId,
        query: needle,
        limit: 50,
        presences: true,
        nonce: `msearch-${guildId}`,
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [guildId, needle]);

  const rows = useMemo<Row[]>(() => {
    if (!members || !guild) return [];
    const all = Object.values(members);
    const nameOf = (m: GuildMember) => displayName(m.user, m.nick);
    if (needle) {
      const found = searchMembers(all, needle, nameOf);
      return [
        { kind: 'header', key: 'h:search', id: 'search', title: 'Search results', count: found.length, collapsed: false },
        ...found.map<Row>((member) => ({ kind: 'member', key: `m:search:${member.user.id}`, member })),
      ];
    }
    const sections = buildMemberSections(all, guild.roles, guild.id, (userId) => (presence[userId]?.status ?? 'offline') !== 'offline', nameOf);
    return flattenSections(sections, collapsed);
  }, [members, guild, presence, collapsed, needle]);

  const toggle = (id: string) => toggleGroup(guildId, id);

  const asideRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useRovingFocus(asideRef, { selector: '.member-row' });
  const virtual = rows.length > VIRTUALISE_ABOVE;
  const virtualizer = useVirtualizer({
    count: virtual ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i]?.kind === 'header' ? HEADER_ROW_PX : MEMBER_ROW_PX),
    overscan: 12,
    getItemKey: (i) => rows[i]?.key ?? i,
  });

  return (
    <aside ref={asideRef} className='members' aria-label='Members'>
      <label className='members-search'>
        <MagnifyingGlass size={14} aria-hidden />
        <input type='search' value={query} placeholder='Search members' aria-label='Search members' onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div ref={scrollRef} className='members-scroll'>
        {virtual ? (
          <div className='members-virtual' style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              if (!row) return null;
              return (
                <div key={row.key} className='members-virtual-row' style={{ transform: `translateY(${item.start}px)`, height: item.size }}>
                  <RowView row={row} guildId={guildId} onToggle={toggle} />
                </div>
              );
            })}
          </div>
        ) : (
          rows.map((row) => <RowView key={row.key} row={row} guildId={guildId} onToggle={toggle} />)
        )}
        {needle && rows.length === 1 && <p className='members-empty'>No members match.</p>}
      </div>
    </aside>
  );
}
