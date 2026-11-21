import { useI18n } from '../../shared/i18n';
import { Plus, X } from '@phosphor-icons/react';
import { useState } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { assignableRoles, rankOf, toggleRoleId } from '@discordy/core/domain/memberModeration';
import { addableRoles, removableRoleIds, roleColorCss } from '@discordy/core/domain/userMenuModel';
import { useGuildPermissions } from '../../shared/hooks/usePermissions';
import { Permission } from '@discordy/core/contracts/permissions';
import { hasPermission } from '@discordy/core/domain/permissions';
import { attempt } from '../../app/actions';
import { getRuntime } from '../../app/runtime';

/** Adds or removes a role on the server and mirrors the result into the member store. */
export async function setMemberRole(guildId: string, userId: string, roleId: string, enabled: boolean): Promise<void> {
  const current = useGuildStore.getState().members[guildId]?.[userId];
  if (!current) return;
  const roles = toggleRoleId(current.roles, roleId, enabled);
  const ok = await attempt(async () => {
    const api = getRuntime().api;
    if (enabled) await api.addMemberRole(guildId, userId, roleId);
    else await api.removeMemberRole(guildId, userId, roleId);
    return true;
  }, 'Could not update roles');
  if (ok) useGuildStore.getState().upsertMember(guildId, { ...current, roles });
}

/** Coloured role pills for a member. With `editable`, shows "x" on assignable roles and a "+" to add more. */
export function RolePills({ guildId, userId, editable = false }: { guildId: string; userId: string; editable?: boolean }) {
  const { t: msg } = useI18n();
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const member = useGuildStore((s) => s.members[guildId]?.[userId]);
  const me = useSessionStore((s) => s.user?.id);
  const actorRoles = useGuildStore((s) => (me ? s.members[guildId]?.[me]?.roles : undefined));
  const perms = useGuildPermissions(guildId);
  const [adding, setAdding] = useState(false);
  if (!guild || !member) return null;

  const canEdit = editable && hasPermission(perms, Permission.MANAGE_ROLES);
  const actorRank = me ? rankOf({ userId: me, roleIds: actorRoles ?? [] }, guild.owner_id, guild.roles) : -1;
  const assignable = canEdit ? assignableRoles(guild.roles, guildId, actorRank) : [];
  const removable = removableRoleIds(member.roles, assignable.map((r) => r.id));
  const shown = guild.roles.filter((r) => member.roles.includes(r.id) && r.id !== guildId).sort((a, b) => b.position - a.position);
  const addable = addableRoles(assignable, member.roles);

  if (shown.length === 0 && addable.length === 0) return null;
  return (
    <ul className='role-chips' aria-label={msg("settings.profiledialog.roles")}>
      {shown.map((r) => (
        <li key={r.id} className='role-pill' data-role-id={r.id}>
          <span className='role-dot' style={{ background: roleColorCss(r.color) ?? 'var(--fg-subtle)' }} />
          {r.name}
          {removable.has(r.id) && (
            <button type='button' className='role-pill-x' aria-label={msg('members.removeRole', { name: r.name })} onClick={() => void setMemberRole(guildId, userId, r.id, false)}>
              <X size={11} weight='bold' />
            </button>
          )}
        </li>
      ))}
      {addable.length > 0 && (
        <li className='role-pill-add'>
          <button type='button' className='role-pill' aria-label={msg("settings.rolepills.add.role")} aria-expanded={adding} onClick={() => setAdding((v) => !v)}>
            <Plus size={12} weight='bold' />
          </button>
          {adding && (
            <ul className='role-add-list' role='menu'>
              {addable.map((r) => (
                <li key={r.id}>
                  <button
                    type='button'
                    role='menuitem'
                    onClick={() => {
                      setAdding(false);
                      void setMemberRole(guildId, userId, r.id, true);
                    }}
                  >
                    <span className='role-dot' style={{ background: roleColorCss(r.color) ?? 'var(--fg-subtle)' }} />
                    {r.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </li>
      )}
    </ul>
  );
}
