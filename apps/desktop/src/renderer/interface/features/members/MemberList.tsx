import { useEffect, useMemo } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { usePresenceStore } from '@renderer/application/stores/peopleStores';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { buildMemberSections } from '@renderer/domain/memberModeration';
import { GatewayOp } from '@shared/contracts/gateway';
import type { GuildMember } from '@shared/contracts/rest';
import { getRuntime } from '../../app/runtime';
import { displayName } from '../../shared/hooks/useNames';
import { Avatar } from '../../shared/ui/Avatar';
import { useMenu } from '../../shared/ui/Menu';
import { UserContextMenu } from './UserContextMenu';

function MemberRow({
  guildId,
  member,
}: {
  guildId: string;
  member: GuildMember;
}) {
  const presence = usePresenceStore((s) => s.byUser[member.user.id]);
  const status = presence?.status ?? 'offline';
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const openDialog = useUiStore((s) => s.openDialog);
  const menu = useMenu();
  const top = guild?.roles
    .filter((r) => member.roles.includes(r.id) && r.color !== 0)
    .sort((a, b) => b.position - a.position)[0];
  const name = displayName(member.user, member.nick);
  const activity = presence?.activities[0];

  return (
    <li>
      <button
        type='button'
        className={`member-row${status === 'offline' ? ' is-offline' : ''}`}
        onClick={() =>
          openDialog({ kind: 'profile', userId: member.user.id, guildId })
        }
        onContextMenu={menu.openAt}
      >
        <Avatar
          id={member.user.id}
          name={name}
          avatar={member.avatar ?? member.user.avatar}
          size={32}
          status={status}
          bot={member.user.bot}
        />
        <span className='member-copy'>
          <span
            className='member-name'
            style={
              top
                ? { color: `#${top.color.toString(16).padStart(6, '0')}` }
                : undefined
            }
          >
            {name}
          </span>
          {activity && (
            <span className='member-activity'>
              {activity.state ?? activity.name}
            </span>
          )}
        </span>
      </button>
      <UserContextMenu
        userId={member.user.id}
        name={name}
        guildId={guildId}
        menu={menu}
      />
    </li>
  );
}

export function MemberList({ guildId }: { guildId: string }) {
  const members = useGuildStore((s) => s.members[guildId]);
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const presence = usePresenceStore((s) => s.byUser);

  useEffect(() => {
    getRuntime().gateway.send(GatewayOp.REQUEST_GUILD_MEMBERS, {
      guild_id: guildId,
      query: '',
      limit: 100,
      nonce: `members-${guildId}`,
    });
  }, [guildId]);

  const sections = useMemo(() => {
    if (!members || !guild) return [];
    return buildMemberSections(
      Object.values(members),
      guild.roles,
      guild.id,
      (userId) => (presence[userId]?.status ?? 'offline') !== 'offline',
      (m) => displayName(m.user, m.nick),
    );
  }, [members, guild, presence]);

  return (
    <aside className='members' aria-label='Members'>
      {sections.map((s) => (
        <section key={s.title}>
          <h3 className='members-heading'>
            {s.title} <span className='tnum'>{s.members.length}</span>
          </h3>
          <ul>
            {s.members.map((m) => (
              <MemberRow key={m.user.id} guildId={guildId} member={m} />
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}
