import { Plus, ShieldStar, Trash } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { permissionsByGroup } from '@renderer/domain/permissionCatalog';
import { hasPermission, parsePermissions, togglePermission } from '@renderer/domain/permissions';
import type { Role } from '@shared/contracts/rest';
import { attempt } from '../../../app/actions';
import { getRuntime } from '../../../app/runtime';
import { Button } from '../../../shared/ui/Button';
import { Field, Input, Switch } from '../../../shared/ui/Form';
import { Menu } from '../../../shared/ui/Menu';

const toHex = (n: number) => (n ? `#${n.toString(16).padStart(6, '0')}` : '#99aab5');
const fromHex = (hex: string) => parseInt(hex.slice(1), 16);
const SWATCHES = ['#e5484d', '#f76b15', '#ffc53d', '#30a46c', '#12a594', '#3e63dd', '#8e4ec6', '#d6409f', '#99aab5'];

export function PermissionMatrix({ value, onToggle, channelOnly = false, query = '' }: { value: string; onToggle: (bit: bigint, enabled: boolean) => void; channelOnly?: boolean; query?: string }) {
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
                <Switch label={p.label} checked={hasPermission(perms, p.bit)} onChange={(v) => onToggle(p.bit, v)} />
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

export function RolesEditor({ guildId }: { guildId: string }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const roles = useMemo(() => [...(guild?.roles ?? [])].sort((a, b) => b.position - a.position), [guild?.roles]);
  const [selectedId, setSelectedId] = useState<string | null>(roles[0]?.id ?? null);
  const selected = roles.find((r) => r.id === selectedId) ?? roles[0];
  const [draft, setDraft] = useState<Role | null>(selected ?? null);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const openDialog = useUiStore((s) => s.openDialog);
  const [swatchMenu, setSwatchMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => setDraft(selected ?? null), [selected]);
  if (!guild || !draft || !selected) return null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(selected);
  const isEveryone = draft.id === guildId;

  const create = async () => {
    const role = await attempt(() => getRuntime().api.createRole(guildId, { name: 'new role', permissions: '0', color: 0 }), 'Could not create role');
    if (role) {
      useGuildStore.getState().upsertRole(guildId, role);
      setSelectedId(role.id);
    }
  };
  const save = async () => {
    setSaving(true);
    const updated = await attempt(() => getRuntime().api.updateRole(guildId, draft.id, { name: draft.name, color: draft.color, hoist: draft.hoist, mentionable: draft.mentionable, permissions: draft.permissions }), 'Could not save role');
    setSaving(false);
    if (updated) useGuildStore.getState().upsertRole(guildId, updated);
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

  return (
    <div className="roles-editor">
      <h1>Roles</h1>
      <p className="page-sub">Roles bundle permissions and a colour. Higher roles in the list win. Members get the union of their roles.</p>
      <div className="roles-layout">
        <aside className="roles-list">
          <Button size="sm" icon={<Plus size={14} />} onClick={() => void create()}>Create role</Button>
          <ul>
            {roles.map((r) => (
              <li key={r.id}>
                <button type="button" className={`role-item${r.id === selected.id ? ' is-active' : ''}`} onClick={() => setSelectedId(r.id)}>
                  <span className="role-dot" style={{ background: toHex(r.color) }} />
                  <span>{r.id === guildId ? '@everyone' : r.name}</span>
                  {parsePermissions(r.permissions) & (1n << 3n) ? <ShieldStar size={14} weight="fill" aria-label="Administrator" /> : null}
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <div className="role-detail">
          {!isEveryone && (
            <div className="role-basics">
              <Field label="Role name">{(id) => <Input id={id} value={draft.name} maxLength={100} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}</Field>
              <Field label="Colour">
                {(id) => (
                  <div className="colour-row">
                    <button type="button" id={id} className="colour-swatch" style={{ background: toHex(draft.color) }} aria-label="Pick colour" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setSwatchMenu({ x: r.left, y: r.bottom + 6 }); }} />
                    <input type="color" aria-label="Custom colour" value={toHex(draft.color)} onChange={(e) => setDraft({ ...draft, color: fromHex(e.target.value) })} />
                    <Menu open={swatchMenu !== null} x={swatchMenu?.x ?? 0} y={swatchMenu?.y ?? 0} onClose={() => setSwatchMenu(null)} entries={SWATCHES.map((c) => ({ kind: 'item' as const, label: c, icon: <span className="role-dot" style={{ background: c }} />, onSelect: () => setDraft({ ...draft, color: fromHex(c) }) }))} minWidth={140} />
                  </div>
                )}
              </Field>
              <div className="role-flags">
                <div className="perm-row"><div><p className="setting-title">Display separately</p><p className="setting-desc">Show members with this role as their own group in the member list.</p></div><Switch label="Display separately" checked={draft.hoist} onChange={(v) => setDraft({ ...draft, hoist: v })} /></div>
                <div className="perm-row"><div><p className="setting-title">Allow anyone to mention this role</p></div><Switch label="Mentionable" checked={draft.mentionable} onChange={(v) => setDraft({ ...draft, mentionable: v })} /></div>
              </div>
            </div>
          )}
          <Input aria-label="Search permissions" placeholder="Search permissions" value={query} onChange={(e) => setQuery(e.target.value)} />
          <PermissionMatrix value={draft.permissions} query={query} onToggle={(bit, enabled) => setDraft({ ...draft, permissions: togglePermission(draft.permissions, bit, enabled) })} />
          {!isEveryone && !draft.managed && <Button variant="danger" icon={<Trash size={15} />} onClick={remove}>Delete role</Button>}
        </div>
      </div>
      {dirty && (
        <div className="save-bar glass" role="status">
          <span>You have unsaved changes.</span>
          <Button variant="ghost" onClick={() => setDraft(selected)}>Reset</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>Save changes</Button>
        </div>
      )}
    </div>
  );
}
