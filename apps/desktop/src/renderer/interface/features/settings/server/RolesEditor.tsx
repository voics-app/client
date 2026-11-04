import { Copy, DotsSixVertical, Lock, Plus, ShieldStar, Trash, Warning } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { permissionsByGroup } from '@discordy/core/domain/permissionCatalog';
import { hasPermission, parsePermissions, togglePermission } from '@discordy/core/domain/permissions';
import { applyPositions, canManageRole, CLEARED_PERMISSIONS, grantableBits, hierarchyList, isAdministrator, memberCounts, reorderPositions } from '@discordy/core/domain/roleManagement';
import { rankOf } from '@discordy/core/domain/memberModeration';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { Permission } from '@discordy/core/contracts/permissions';
import { useGuildPermissions } from '../../../shared/hooks/usePermissions';
import { setMemberRole } from '../../members/RolePills';
import type { Role } from '@discordy/core/contracts/rest';
import { attempt } from '../../../app/actions';
import { getRuntime } from '../../../app/runtime';
import { UnsavedBar } from '../../../shared/ui/UnsavedBar';
import { Button } from '../../../shared/ui/Button';
import { Field, Input, Switch } from '../../../shared/ui/Form';
import { Menu, type MenuEntry } from '../../../shared/ui/Menu';

const toHex = (n: number) => (n ? `#${n.toString(16).padStart(6, '0')}` : '#99aab5');
const fromHex = (hex: string) => parseInt(hex.slice(1), 16);
const SWATCHES = ['#e5484d', '#f76b15', '#ffc53d', '#30a46c', '#12a594', '#3e63dd', '#8e4ec6', '#d6409f', '#99aab5'];

export function PermissionMatrix({ value, onToggle, channelOnly = false, query = '', isLocked }: { value: string; onToggle: (bit: bigint, enabled: boolean) => void; channelOnly?: boolean; query?: string; isLocked?: (bit: bigint) => boolean }) {
  const perms = parsePermissions(value);
  return (
    <div className="perm-matrix">
      {permissionsByGroup(channelOnly).map(({ group, entries }) => {
        const shown = entries.filter((e) => !query || e.label.toLowerCase().includes(query.toLowerCase()));
        if (shown.length === 0) return null;
        return (
          <section key={group}>
            <h4>{group}</h4>
            {shown.map((p) => (
              <div key={p.name} className="perm-row">
                <div>
                  <p className="setting-title">{p.label}</p>
                  <p className="setting-desc">{p.description}</p>
                </div>
                <Switch label={p.label} checked={hasPermission(perms, p.bit)} disabled={isLocked?.(p.bit)} onChange={(v) => onToggle(p.bit, v)} />
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

type Tab = 'display' | 'permissions' | 'members';

function RoleMembers({ guildId, roleId, canEdit }: { guildId: string; roleId: string; canEdit: boolean }) {
  const members = useGuildStore((s) => s.members[guildId]);
  const [query, setQuery] = useState('');
  const q = query.toLowerCase();
  const all = Object.values(members ?? {});
  const matches = (m: (typeof all)[number]) => (m.nick ?? m.user.username).toLowerCase().includes(q) || m.user.username.toLowerCase().includes(q);
  const has = all.filter((m) => m.roles.includes(roleId) && matches(m));
  const candidates = query ? all.filter((m) => !m.roles.includes(roleId) && matches(m)).slice(0, 8) : [];
  return (
    <div className="role-members">
      <Input aria-label="Search members" placeholder={canEdit ? 'Search members to add or remove' : 'Search members'} value={query} onChange={(e) => setQuery(e.target.value)} />
      {canEdit && candidates.length > 0 && (
        <ul className="manage-list" aria-label="Add members">
          {candidates.map((m) => (
            <li key={m.user.id}>
              <div className="manage-copy"><strong>{m.nick ?? m.user.username}</strong><span className="mono">{m.user.username}</span></div>
              <Button size="sm" onClick={() => void setMemberRole(guildId, m.user.id, roleId, true)}>Add</Button>
            </li>
          ))}
        </ul>
      )}
      {has.length === 0 ? <p className="setting-desc">No members have this role.</p> : (
        <ul className="manage-list" aria-label="Members with this role">
          {has.slice(0, 200).map((m) => (
            <li key={m.user.id}>
              <div className="manage-copy"><strong>{m.nick ?? m.user.username}</strong><span className="mono">{m.user.username}</span></div>
              {canEdit && <Button size="sm" variant="ghost" onClick={() => void setMemberRole(guildId, m.user.id, roleId, false)}>Remove</Button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RolesEditor({ guildId }: { guildId: string }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const members = useGuildStore((s) => s.members[guildId]);
  const me = useSessionStore((s) => s.user?.id);
  const perms = useGuildPermissions(guildId);
  const roles = useMemo(() => hierarchyList(guild?.roles ?? [], guildId), [guild?.roles, guildId]);
  const everyone = guild?.roles.find((r) => r.id === guildId);
  const [selectedId, setSelectedId] = useState<string | null>(roles[0]?.id ?? null);
  const selected = (selectedId === guildId ? everyone : roles.find((r) => r.id === selectedId)) ?? roles[0] ?? everyone;
  const [draft, setDraft] = useState<Role | null>(selected ?? null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('display');
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const openDialog = useUiStore((s) => s.openDialog);
  const [swatchMenu, setSwatchMenu] = useState<{ x: number; y: number } | null>(null);
  const [roleMenu, setRoleMenu] = useState<{ x: number; y: number; role: Role } | null>(null);
  const counts = useMemo(() => memberCounts(Object.values(members ?? {}), guildId), [members, guildId]);

  useEffect(() => setDraft(selected ?? null), [selected]);
  if (!guild || !draft || !selected) return null;
  const isOwner = me === guild.owner_id;
  const actorRank = me ? rankOf({ userId: me, roleIds: members?.[me]?.roles ?? [] }, guild.owner_id, guild.roles) : -1;
  const canManage = hasPermission(perms, Permission.MANAGE_ROLES);
  const editable = canManage && canManageRole(selected, guildId, actorRank, isOwner);
  const grantable = grantableBits(perms, isOwner);
  const dirty = JSON.stringify(draft) !== JSON.stringify(selected);
  const isEveryone = draft.id === guildId;
  const lockedBit = (bit: bigint) => !editable || (grantable !== 'all' && !hasPermission(grantable, bit) && !hasPermission(parsePermissions(selected.permissions), bit));

  const create = async () => {
    const role = await attempt(() => getRuntime().api.createRole(guildId, { name: 'new role', permissions: '0', color: 0 }), 'Could not create role');
    if (role) {
      useGuildStore.getState().upsertRole(guildId, role);
      setSelectedId(role.id);
      setTab('display');
    }
  };
  const duplicate = async (role: Role) => {
    const copy = await attempt(() => getRuntime().api.duplicateRole(guildId, role.id), 'Could not duplicate role');
    if (!copy) return;
    const fresh = await attempt(() => getRuntime().api.roles(guildId), 'Could not refresh roles');
    for (const r of fresh ?? [copy]) useGuildStore.getState().upsertRole(guildId, r);
    setSelectedId(copy.id);
    setTab('display');
  };
  const roleMenuEntries = (role: Role): MenuEntry[] => [
    { kind: 'item', label: 'Duplicate role', icon: <Copy size={16} />, disabled: !canManage || role.managed || !canManageRole(role, guildId, actorRank, isOwner), onSelect: () => void duplicate(role) },
    { kind: 'item', label: 'Edit role', onSelect: () => { setSelectedId(role.id); setTab('display'); } },
  ];
  const save = async () => {
    setSaving(true);
    const updated = await attempt(() => getRuntime().api.updateRole(guildId, draft.id, { name: draft.name, color: draft.color, hoist: draft.hoist, mentionable: draft.mentionable, permissions: draft.permissions, unicode_emoji: draft.unicode_emoji ?? null }), 'Could not save role');
    setSaving(false);
    if (updated) useGuildStore.getState().upsertRole(guildId, updated);
  };
  const drop = async (toIndex: number) => {
    const id = dragId;
    setDragId(null);
    setOverIndex(null);
    if (!id) return;
    const changes = reorderPositions(roles, id, toIndex, actorRank, isOwner);
    if (changes.length === 0) return;
    const before = guild.roles;
    for (const r of applyPositions(guild.roles, changes)) useGuildStore.getState().upsertRole(guildId, r);
    const saved = await attempt(() => getRuntime().api.reorderRoles(guildId, changes), 'Could not reorder roles');
    if (saved) for (const r of saved) useGuildStore.getState().upsertRole(guildId, r);
    else for (const r of before) useGuildStore.getState().upsertRole(guildId, r);
  };
  const remove = () =>
    openDialog({
      kind: 'confirm',
      title: `Delete ${draft.name}?`,
      body: 'Members lose the permissions this role gave them.',
      confirmLabel: 'Delete role',
      danger: true,
      onConfirm: async () => {
        await attempt(() => getRuntime().api.deleteRole(guildId, draft.id), 'Could not delete role');
        useGuildStore.getState().removeRole(guildId, draft.id);
        setSelectedId(guildId);
      },
    });
  const clearable = editable && parsePermissions(draft.permissions) !== 0n;
  const tabs: Tab[] = isEveryone ? ['permissions'] : ['display', 'permissions', 'members'];
  const activeTab: Tab = isEveryone ? 'permissions' : tab;

  return (
    <div className="roles-editor">
      <h1>Roles</h1>
      <p className="page-sub">Roles bundle permissions and a colour. Higher roles in the list win. Drag to reorder roles below your own highest role. Members get the union of their roles.</p>
      <div className="roles-layout">
        <aside className="roles-list">
          {canManage && <Button size="sm" icon={<Plus size={14} />} onClick={() => void create()}>Create role</Button>}
          <ul>
            {roles.map((r, i) => {
              const movable = canManage && canManageRole(r, guildId, actorRank, isOwner);
              return (
                <li
                  key={r.id}
                  className={overIndex === i && dragId ? 'is-drop-target' : undefined}
                  draggable={movable}
                  data-testid={`role-row-${r.id}`}
                  onDragStart={(e) => { if (!movable) return; e.dataTransfer.effectAllowed = 'move'; setDragId(r.id); }}
                  onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverIndex(i); } }}
                  onDragEnd={() => { setDragId(null); setOverIndex(null); }}
                  onContextMenu={(e) => { e.preventDefault(); setRoleMenu({ x: e.clientX, y: e.clientY, role: r }); }}
                  onDrop={(e) => { e.preventDefault(); void drop(i); }}
                >
                  <button type="button" className={`role-item${r.id === selected.id ? ' is-active' : ''}`} onClick={() => setSelectedId(r.id)}>
                    {movable ? <DotsSixVertical size={14} aria-label="Drag to reorder" /> : <Lock size={14} aria-label="Above your highest role" />}
                    <span className="role-dot" style={{ background: toHex(r.color) }} />
                    <span className="role-name">{r.unicode_emoji ? `${r.unicode_emoji} ` : ''}{r.name}</span>
                    {isAdministrator(r.permissions) ? <ShieldStar size={14} weight="fill" aria-label="Administrator" /> : null}
                    <span className="role-count" aria-label={`${counts[r.id] ?? 0} members`}>{counts[r.id] ?? 0}</span>
                  </button>
                </li>
              );
            })}
            {everyone && (
              <li>
                <button type="button" className={`role-item${everyone.id === selected.id ? ' is-active' : ''}`} onClick={() => setSelectedId(everyone.id)}>
                  <span className="role-dot" style={{ background: toHex(0) }} />
                  <span className="role-name">@everyone</span>
                  <span className="role-count" aria-label={`${counts[guildId] ?? 0} members`}>{counts[guildId] ?? 0}</span>
                </button>
              </li>
            )}
          </ul>
        </aside>
        <div className="role-detail">
          {!editable && <p className="setting-desc" role="note"><Lock size={14} /> You cannot edit this role because it is at or above your highest role.</p>}
          <div className="role-tabs" role="tablist">
            {tabs.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={activeTab === t} className={`role-tab${activeTab === t ? ' is-active' : ''}`} onClick={() => setTab(t)}>
                {t === 'display' ? 'Display' : t === 'permissions' ? 'Permissions' : `Manage members (${counts[draft.id] ?? 0})`}
              </button>
            ))}
          </div>
          {activeTab === 'display' && !isEveryone && (
            <div className="role-basics">
              <Field label="Role name">{(id) => <Input id={id} value={draft.name} maxLength={100} disabled={!editable} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}</Field>
              <Field label="Role icon (emoji)">{(id) => <Input id={id} value={draft.unicode_emoji ?? ''} maxLength={8} placeholder="Shown next to the role name" disabled={!editable} onChange={(e) => setDraft({ ...draft, unicode_emoji: e.target.value.trim() || null })} />}</Field>
              <Field label="Colour">
                {(id) => (
                  <div className="colour-row">
                    <button type="button" id={id} className="colour-swatch" disabled={!editable} style={{ background: toHex(draft.color) }} aria-label="Pick colour" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setSwatchMenu({ x: r.left, y: r.bottom + 6 }); }} />
                    <input type="color" aria-label="Custom colour" disabled={!editable} value={toHex(draft.color)} onChange={(e) => setDraft({ ...draft, color: fromHex(e.target.value) })} />
                    <Menu open={swatchMenu !== null} x={swatchMenu?.x ?? 0} y={swatchMenu?.y ?? 0} onClose={() => setSwatchMenu(null)} entries={SWATCHES.map((c) => ({ kind: 'item' as const, label: c, icon: <span className="role-dot" style={{ background: c }} />, onSelect: () => setDraft({ ...draft, color: fromHex(c) }) }))} minWidth={140} />
                  </div>
                )}
              </Field>
              <div className="role-flags">
                <div className="perm-row"><div><p className="setting-title">Display separately</p><p className="setting-desc">Show members with this role as their own group in the member list.</p></div><Switch label="Display separately" disabled={!editable} checked={draft.hoist} onChange={(v) => setDraft({ ...draft, hoist: v })} /></div>
                <div className="perm-row"><div><p className="setting-title">Allow anyone to mention this role</p></div><Switch label="Mentionable" disabled={!editable} checked={draft.mentionable} onChange={(v) => setDraft({ ...draft, mentionable: v })} /></div>
              </div>
              {editable && !draft.managed && <Button icon={<Copy size={15} />} onClick={() => void duplicate(draft)}>Duplicate role</Button>}
              {editable && !draft.managed && <Button variant="danger" icon={<Trash size={15} />} onClick={remove}>Delete role</Button>}
            </div>
          )}
          {activeTab === 'permissions' && (
            <>
              {isEveryone && <p className="setting-desc">@everyone applies to every member. These are the default permissions.</p>}
              {isAdministrator(draft.permissions) && (
                <p className="role-admin-warning" role="alert"><Warning size={16} weight="fill" /> Administrator grants every permission and bypasses channel overwrites. Only give it to people you trust.</p>
              )}
              <div className="role-perm-tools">
                <Input aria-label="Search permissions" placeholder="Search permissions" value={query} onChange={(e) => setQuery(e.target.value)} />
                <Button size="sm" variant="ghost" disabled={!clearable} onClick={() => setDraft({ ...draft, permissions: CLEARED_PERMISSIONS })}>Clear permissions</Button>
              </div>
              <PermissionMatrix value={draft.permissions} query={query} isLocked={lockedBit} onToggle={(bit, enabled) => setDraft({ ...draft, permissions: togglePermission(draft.permissions, bit, enabled) })} />
            </>
          )}
          {activeTab === 'members' && !isEveryone && <RoleMembers guildId={guildId} roleId={draft.id} canEdit={editable && !draft.managed} />}
        </div>
      </div>
      <Menu open={roleMenu !== null} x={roleMenu?.x ?? 0} y={roleMenu?.y ?? 0} onClose={() => setRoleMenu(null)} entries={roleMenu ? roleMenuEntries(roleMenu.role) : []} minWidth={180} />
      <UnsavedBar dirty={dirty && editable} saving={saving} onReset={() => setDraft(selected)} onSave={() => void save()} />
    </div>
  );
}
