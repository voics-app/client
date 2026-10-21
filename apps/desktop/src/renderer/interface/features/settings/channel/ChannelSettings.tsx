import { SettingsCloseButton } from '../SettingsCloseButton';
import { Check, Minus, Plus, X } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { permissionsByGroup } from '@renderer/domain/permissionCatalog';
import { overwriteStateOf, withOverwriteState, type OverwriteState } from '@renderer/domain/permissions';
import { ChannelType, type PermissionOverwrite } from '@shared/contracts/rest';
import { attempt } from '../../../app/actions';
import { getRuntime } from '../../../app/runtime';
import { displayName } from '../../../shared/hooks/useNames';
import { Button } from '../../../shared/ui/Button';
import { Field, Input, Segmented, Switch, TextArea } from '../../../shared/ui/Form';
import { Menu, useMenu } from '../../../shared/ui/Menu';
import { ModeSwitcher } from '../../privacy/ModeSwitcher';
import { VoiceTextChatSetting } from './VoiceTextChatSetting';
import { ServerInvites } from '../server/ServerTabs';

function TriState({ state, label, onChange }: { state: OverwriteState; label: string; onChange: (s: OverwriteState) => void }) {
  const opts: { s: OverwriteState; icon: React.ReactNode; title: string }[] = [
    { s: 'deny', icon: <X size={14} weight="bold" />, title: 'Deny' },
    { s: 'inherit', icon: <Minus size={14} weight="bold" />, title: 'Inherit' },
    { s: 'allow', icon: <Check size={14} weight="bold" />, title: 'Allow' },
  ];
  return (
    <span className="tri" role="radiogroup" aria-label={label}>
      {opts.map((o) => (
        <button key={o.s} type="button" role="radio" aria-checked={state === o.s} title={o.title} className={`tri-${o.s}${state === o.s ? ' is-on' : ''}`} onClick={() => onChange(o.s)}>
          {o.icon}
        </button>
      ))}
    </span>
  );
}

function Overwrites({ channelId }: { channelId: string }) {
  const channel = useGuildStore((s) => s.channels[channelId]);
  const guild = useGuildStore((s) => (channel?.guild_id ? s.guilds[channel.guild_id] : undefined));
  const members = useGuildStore((s) => (channel?.guild_id ? s.members[channel.guild_id] : undefined));
  const [draft, setDraft] = useState<PermissionOverwrite[]>(channel?.permission_overwrites ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(channel?.guild_id ?? null);
  const [saving, setSaving] = useState(false);
  const addMenu = useMenu();
  useEffect(() => setDraft(channel?.permission_overwrites ?? []), [channel?.permission_overwrites]);
  const saved = channel?.permission_overwrites ?? [];
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const current = draft.find((o) => o.id === selectedId) ?? { id: selectedId ?? '', type: 0 as const, allow: '0', deny: '0' };

  const nameOf = (o: PermissionOverwrite): string => {
    if (o.type === 0) return o.id === guild?.id ? '@everyone' : (guild?.roles.find((r) => r.id === o.id)?.name ?? 'role');
    const m = members?.[o.id];
    return m ? displayName(m.user, m.nick) : o.id;
  };
  const upsert = (o: PermissionOverwrite) => setDraft((d) => (d.some((x) => x.id === o.id) ? d.map((x) => (x.id === o.id ? o : x)) : [...d, o]));

  const addable = [
    ...(guild?.roles ?? []).filter((r) => !draft.some((o) => o.id === r.id)).map((r) => ({ id: r.id, type: 0 as const, label: r.id === guild?.id ? '@everyone' : r.name })),
    ...Object.values(members ?? {}).slice(0, 25).filter((m) => !draft.some((o) => o.id === m.user.id)).map((m) => ({ id: m.user.id, type: 1 as const, label: `@${displayName(m.user, m.nick)}` })),
  ];

  const save = async () => {
    setSaving(true);
    const api = getRuntime().api;
    await attempt(async () => {
      for (const o of draft) {
        const before = saved.find((x) => x.id === o.id);
        if (!before || before.allow !== o.allow || before.deny !== o.deny) await api.putOverwrite(channelId, o);
      }
      for (const o of saved) if (!draft.some((x) => x.id === o.id)) await api.deleteOverwrite(channelId, o.id);
      if (channel) useGuildStore.getState().upsertChannel({ ...channel, permission_overwrites: draft });
    }, 'Could not save permissions');
    setSaving(false);
  };

  if (!channel || !guild) return null;
  const groups = permissionsByGroup(true);
  return (
    <div className="overwrites">
      <div className="overwrite-targets">
        <Button size="sm" icon={<Plus size={14} />} onClick={addMenu.openBelow}>Add role or member</Button>
        <Menu open={addMenu.open} x={addMenu.anchor?.x ?? 0} y={addMenu.anchor?.y ?? 0} onClose={addMenu.close} entries={addable.map((a) => ({ kind: 'item' as const, label: a.label, onSelect: () => { upsert({ id: a.id, type: a.type, allow: '0', deny: '0' }); setSelectedId(a.id); } }))} />
        <ul>
          {[...draft, ...(draft.some((o) => o.id === guild.id) ? [] : [{ id: guild.id, type: 0 as const, allow: '0', deny: '0' }])].map((o) => (
            <li key={o.id}><button type="button" className={`role-item${o.id === selectedId ? ' is-active' : ''}`} onClick={() => setSelectedId(o.id)}>{nameOf(o)}</button></li>
          ))}
        </ul>
      </div>
      <div className="overwrite-matrix">
        {groups.map(({ group, entries }) => (
          <section key={group}>
            <h4>{group}</h4>
            {entries.map((p) => (
              <div key={p.name} className="perm-row">
                <div><p className="setting-title">{p.label}</p></div>
                <TriState label={p.label} state={overwriteStateOf(current, p.bit)} onChange={(s) => upsert(withOverwriteState(current, p.bit, s))} />
              </div>
            ))}
          </section>
        ))}
      </div>
      {dirty && (
        <div className="save-bar glass" role="status">
          <span>You have unsaved changes.</span>
          <Button variant="ghost" onClick={() => setDraft(saved)}>Reset</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>Save changes</Button>
        </div>
      )}
    </div>
  );
}

function Overview({ channelId }: { channelId: string }) {
  const channel = useGuildStore((s) => s.channels[channelId]);
  const [name, setName] = useState(channel?.name ?? '');
  const [topic, setTopic] = useState(channel?.topic ?? '');
  const [slow, setSlow] = useState(String(channel?.rate_limit_per_user ?? 0));
  const [nsfw, setNsfw] = useState(channel?.nsfw ?? false);
  const [saving, setSaving] = useState(false);
  const openDialog = useUiStore((s) => s.openDialog);
  const openSettings = useUiStore((s) => s.openSettings);
  const isVoice = channel?.type === ChannelType.GUILD_VOICE || channel?.type === ChannelType.GUILD_STAGE_VOICE;
  const mode = useMemo(() => (channel ? getRuntime().privacy.sender.resolveMode(channel) : 'standard'), [channel]);
  if (!channel) return null;
  const save = async () => {
    setSaving(true);
    const updated = await attempt(() => getRuntime().api.updateChannel(channelId, { name, topic: topic || null, nsfw, rate_limit_per_user: Number(slow) }), 'Could not save channel');
    setSaving(false);
    if (updated) useGuildStore.getState().upsertChannel(updated);
  };
  return (
    <div className="settings-page">
      <h1>Overview</h1>
      <Field label="Channel name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
      {!isVoice && <Field label="Topic">{(id) => <TextArea id={id} value={topic} maxLength={1024} onChange={(e) => setTopic(e.target.value)} />}</Field>}
      {!isVoice && (
        <Field label="Slowmode">
          {() => <Segmented label="Slowmode" value={slow} onChange={setSlow} options={[{ value: '0', label: 'Off' }, { value: '5', label: '5s' }, { value: '30', label: '30s' }, { value: '300', label: '5m' }, { value: '3600', label: '1h' }]} />}
        </Field>
      )}
      <div className="perm-row"><div><p className="setting-title">Age-restricted channel</p></div><Switch label="Age-restricted" checked={nsfw} onChange={setNsfw} /></div>
      <VoiceTextChatSetting channelId={channelId} />
      <div className="perm-row">
        <div><p className="setting-title">Delivery mode</p><p className="setting-desc">Ephemeral channels are end-to-end encrypted, limited to 100 members, and do not support bots or embeds.</p></div>
        <ModeSwitcher channel={channel} mode={mode} />
      </div>
      <div className="row-end">
        <Button variant="danger" onClick={() => openDialog({ kind: 'confirm', title: `Delete #${channel.name}?`, body: 'Messages in this channel will be lost for everyone.', confirmLabel: 'Delete channel', danger: true, onConfirm: async () => { await attempt(() => getRuntime().api.deleteChannel(channelId), 'Could not delete channel'); openSettings(null); } })}>Delete channel</Button>
        <Button variant="primary" loading={saving} onClick={() => void save()}>Save changes</Button>
      </div>
    </div>
  );
}

export function ChannelSettings({ channelId, tab }: { channelId: string; tab: 'overview' | 'permissions' | 'invites' }) {
  const open = useUiStore((s) => s.openSettings);
  const channel = useGuildStore((s) => s.channels[channelId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && open(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!channel) return null;
  const tabs = [{ id: 'overview', label: 'Overview' }, { id: 'permissions', label: 'Permissions' }, { id: 'invites', label: 'Invites' }] as const;
  return (
    <div className="settings" role="dialog" aria-modal="true" aria-label="Channel settings">
      <nav className="settings-nav">
        <div className="settings-group">
          <h3>#{channel.name}</h3>
          {tabs.map((t) => <button key={t.id} type="button" className={`settings-item${tab === t.id ? ' is-active' : ''}`} onClick={() => open({ kind: 'channel', channelId, tab: t.id })}>{t.label}</button>)}
        </div>
      </nav>
      <div className="settings-content">
        <div className="settings-inner">
          {tab === 'overview' && <Overview channelId={channelId} />}
          {tab === 'permissions' && <div className="settings-page"><h1>Permissions</h1><p className="page-sub">Overwrites win over role permissions. Deny beats allow within the same layer.</p><Overwrites channelId={channelId} /></div>}
          {tab === 'invites' && channel.guild_id && <ServerInvites guildId={channel.guild_id} />}
        </div>
        <SettingsCloseButton onClose={() => open(null)} />
      </div>
    </div>
  );
}
