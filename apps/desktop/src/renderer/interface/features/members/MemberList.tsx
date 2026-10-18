import { useEffect, useMemo } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { usePresenceStore } from '@renderer/application/stores/peopleStores';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { GatewayOp } from '@shared/contracts/gateway';
import { Permission } from '@shared/contracts/permissions';
import type { GuildMember } from '@shared/contracts/rest';
import { attempt, copyText } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { can, useGuildPermissions } from '../../shared/hooks/usePermissions';
import { displayName } from '../../shared/hooks/useNames';
import { Avatar } from '../../shared/ui/Avatar';
import { Menu, useMenu, type MenuEntry } from '../../shared/ui/Menu';

function MemberRow({ guildId, member, canKick, canBan }: { guildId: string; member: GuildMember; canKick: boolean; canBan: boolean }) {
  const presence = usePresenceStore((s) => s.byUser[member.user.id]);
  const status = presence?.status ?? 'offline';
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const me = useSessionStore((s) => s.user?.id);
  const openDialog = useUiStore((s) => s.openDialog);
  const menu = useMenu();
  const top = guild?.roles.filter((r) => member.roles.includes(r.id) && r.color !== 0).sort((a, b) => b.position - a.position)[0];
  const name = displayName(member.user, member.nick);
  const isSelf = member.user.id === me;
  const isOwner = guild?.owner_id === member.user.id;
  const activity = presence?.activities[0];

  const entries: MenuEntry[] = [
    { kind: 'item', label: 'Profile', onSelect: () => openDialog({ kind: 'profile', userId: member.user.id, guildId }) },
    { kind: 'item', label: 'Copy user ID', onSelect: () => void copyText(member.user.id, 'User ID copied') },
    ...(!isSelf && !isOwner && canKick
      ? [
          { kind: 'separator' } satisfies MenuEntry,
          { kind: 'item', label: `Kick ${name}`, danger: true, onSelect: () => openDialog({ kind: 'confirm', title: `Kick ${name}?`, body: 'They can rejoin with a new invite.', confirmLabel: 'Kick', danger: true, onConfirm: async () => void (await attempt(() => getRuntime().api.kickMember(guildId, member.user.id), 'Could not kick')) }) } satisfies MenuEntry,
        ]
      : []),
    ...(!isSelf && !isOwner && canBan
      ? [{ kind: 'item', label: `Ban ${name}`, danger: true, onSelect: () => openDialog({ kind: 'confirm', title: `Ban ${name}?`, body: 'They will be removed and cannot rejoin until unbanned.', confirmLabel: 'Ban', danger: true, onConfirm: async () => void (await attempt(() => getRuntime().api.ban(guildId, member.user.id), 'Could not ban')) }) } satisfies MenuEntry]
      : []),
  ];

  return (
    <li>
      <button type="button" className={`member-row${status === 'offline' ? ' is-offline' : ''}`} onClick={() => openDialog({ kind: 'profile', userId: member.user.id, guildId })} onContextMenu={menu.openAt}>
        <Avatar id={member.user.id} name={name} avatar={member.avatar ?? member.user.avatar} size={32} status={status} bot={member.user.bot} />
        <span className="member-copy">
          <span className="member-name" style={top ? { color: `#${top.color.toString(16).padStart(6, '0')}` } : undefined}>{name}</span>
          {activity && <span className="member-activity">{activity.state ?? activity.name}</span>}
        </span>
      </button>
      <Menu open={menu.open} x={menu.anchor?.x ?? 0} y={menu.anchor?.y ?? 0} entries={entries} onClose={menu.close} />
    </li>
  );
}

export function MemberList({ guildId }: { guildId: string }) {
  const members = useGuildStore((s) => s.members[guildId]);
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const presence = usePresenceStore((s) => s.byUser);
  const perms = useGuildPermissions(guildId);

  useEffect(() => {
    getRuntime().gateway.send(GatewayOp.REQUEST_GUILD_MEMBERS, { guild_id: guildId, query: '', limit: 100, nonce: `members-${guildId}` });
  }, [guildId]);

  const sections = useMemo(() => {
    if (!members || !guild) return [];
    const hoisted = guild.roles.filter((r) => r.hoist && r.id !== guild.id).sort((a, b) => b.position - a.position);
    const online = Object.values(members).filter((m) => (presence[m.user.id]?.status ?? 'offline') !== 'offline');
    const offline = Object.values(members).filter((m) => (presence[m.user.id]?.status ?? 'offline') === 'offline');
    const byName = (a: GuildMember, b: GuildMember) => displayName(a.user, a.nick).localeCompare(displayName(b.user, b.nick));
    const used = new Set<string>();
    const result: { title: string; members: GuildMember[] }[] = [];
    for (const role of hoisted) {
      const list = online.filter((m) => !used.has(m.user.id) && m.roles.includes(role.id)).sort(byName);
      list.forEach((m) => used.add(m.user.id));
      if (list.length) result.push({ title: role.name, members: list });
    }
    const rest = online.filter((m) => !used.has(m.user.id)).sort(byName);
    if (rest.length) result.push({ title: 'Online', members: rest });
    if (offline.length) result.push({ title: 'Offline', members: offline.sort(byName) });
    return result;
  }, [members, guild, presence]);

  return (
    <aside className="members" aria-label="Members">
      {sections.map((s) => (
        <section key={s.title}>
          <h3 className="members-heading">{s.title} <span className="tnum">{s.members.length}</span></h3>
          <ul>
            {s.members.map((m) => (
              <MemberRow key={m.user.id} guildId={guildId} member={m} canKick={can(perms, Permission.KICK_MEMBERS)} canBan={can(perms, Permission.BAN_MEMBERS)} />
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}
