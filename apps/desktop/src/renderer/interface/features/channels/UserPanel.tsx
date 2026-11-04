import { Gear, Headphones, SpeakerSlash, Microphone, MicrophoneSlash } from '@phosphor-icons/react';
import { useState } from 'react';
import { usePresenceStore } from '@renderer/application/stores/peopleStores';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { useVoiceStore } from '@renderer/application/stores/voiceStore';
import type { PresenceStatus } from '@discordy/core/contracts/rest';
import { menuTopAbove } from '@discordy/core/domain/menuPlacement';
import { activeCustomStatus } from '@discordy/core/domain/selfPresence';
import { setAutoIdle } from '@renderer/application/selfPresence';
import { publishPresence } from '../../app/presenceActions';
import { attempt } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { toggleDeafen, toggleMute } from '../../app/voiceActions';
import { displayName } from '../../shared/hooks/useNames';
import { Avatar } from '../../shared/ui/Avatar';
import { IconButton } from '../../shared/ui/IconButton';
import { Menu, type MenuEntry } from '../../shared/ui/Menu';
import { DeviceArrow, useKeyHint } from '../voice/DeviceMenus';

const STATUSES: { id: Exclude<PresenceStatus, 'offline'>; label: string; hint: string }[] = [
  { id: 'online', label: 'Online', hint: '' },
  { id: 'idle', label: 'Idle', hint: '' },
  { id: 'dnd', label: 'Do not disturb', hint: 'Mutes desktop notifications' },
  { id: 'invisible', label: 'Invisible', hint: 'Appear offline' },
];

export function setStatus(status: Exclude<PresenceStatus, 'offline'>): void {
  const rt = getRuntime();
  useSessionStore.getState().setSettings({ status });
  setAutoIdle(false);
  publishPresence();
  void attempt(() => rt.api.updateSettings({ status }), 'Could not update status');
}

export function UserPanel() {
  const user = useSessionStore((s) => s.user);
  const settingsStatus = useSessionStore((s) => s.settings.status);
  const storedCustom = useSessionStore((s) => s.settings.custom_status);
  const presence = usePresenceStore((s) => (user ? s.byUser[user.id]?.status : undefined));
  const selfMute = useVoiceStore((s) => s.selfMute);
  const selfDeaf = useVoiceStore((s) => s.selfDeaf);
  const openSettings = useUiStore((s) => s.openSettings);
  const openDialog = useUiStore((s) => s.openDialog);
  const muteKeys = useKeyHint('toggleMute');
  const deafenKeys = useKeyHint('toggleDeafen');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  if (!user) return null;
  const status = (presence && presence !== 'offline' ? presence : settingsStatus) ?? 'online';
  const active = activeCustomStatus(storedCustom, Date.now());
  const customStatus = active ? [active.emoji_id ? '' : active.emoji_name, active.text].filter(Boolean).join(' ') : '';

  const entries: MenuEntry[] = [
    { kind: 'label', label: 'Status' },
    ...STATUSES.map<MenuEntry>((s) => ({ kind: 'item', label: s.label, checked: (settingsStatus ?? 'online') === s.id, onSelect: () => setStatus(s.id) })),
    { kind: 'separator' },
    { kind: 'item', label: 'Set custom status', onSelect: () => openDialog({ kind: 'customStatus' }) },
    { kind: 'item', label: 'Edit profile', onSelect: () => openSettings({ kind: 'user', tab: 'profile' }) },
  ];

  return (
    <div className="user-panel">
      <button
        type="button"
        className="user-panel-id"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: r.left, y: menuTopAbove(r, entries.length, window.innerHeight) });
        }}
        aria-haspopup="menu"
        aria-label="Account and status"
      >
        <Avatar id={user.id} name={displayName(user)} avatar={user.avatar} size={34} status={status === 'invisible' ? 'offline' : status} />
        <span className="user-panel-copy">
          <span className="user-panel-name">{displayName(user)}</span>
          <span className="user-panel-sub">{customStatus || STATUSES.find((s) => s.id === status)?.label}</span>
        </span>
      </button>
      <div className="user-panel-actions">
        <span className="split-control">
          <IconButton label={selfMute ? 'Unmute' : 'Mute'} hint={muteKeys} active={selfMute} tone={selfMute ? 'danger' : 'default'} onClick={() => void toggleMute()}>
            {selfMute ? <MicrophoneSlash size={20} /> : <Microphone size={20} />}
          </IconButton>
          <DeviceArrow kind="input" />
        </span>
        <span className="split-control">
          <IconButton label={selfDeaf ? 'Undeafen' : 'Deafen'} hint={deafenKeys} active={selfDeaf} tone={selfDeaf ? 'danger' : 'default'} onClick={() => void toggleDeafen()}>
            {selfDeaf ? <SpeakerSlash size={20} /> : <Headphones size={20} />}
          </IconButton>
          <DeviceArrow kind="output" />
        </span>
        <IconButton label="User settings" onClick={() => openSettings({ kind: 'user', tab: 'account' })}>
          <Gear size={20} />
        </IconButton>
      </div>
      <Menu open={menu !== null} x={menu?.x ?? 0} y={menu?.y ?? 0} entries={entries} onClose={() => setMenu(null)} minWidth={232} />
    </div>
  );
}
