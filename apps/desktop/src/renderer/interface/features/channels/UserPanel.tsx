import { useI18n } from '../../shared/i18n';
import { Gear, Headphones, SpeakerSlash, Microphone, MicrophoneSlash } from '@phosphor-icons/react';
import { useState } from 'react';
import { usePresenceStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { menuTopAbove } from '@discordy/core/domain/menuPlacement';
import { customStatusLine, shownStatus, STATUS_CHOICES, type ManualStatus } from '@discordy/core/domain/selfPresence';
import { setAutoIdle } from '@discordy/core/application/selfPresence';
import { publishPresence } from '../../app/presenceActions';
import { attempt } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { toggleDeafen, toggleMute } from '../../app/voiceActions';
import { displayName } from '../../shared/hooks/useNames';
import { Avatar } from '../../shared/ui/Avatar';
import { IconButton } from '../../shared/ui/IconButton';
import { Menu, type MenuEntry } from '../../shared/ui/Menu';
import { DeviceArrow, useKeyHint } from '../voice/DeviceMenus';

export function setStatus(status: ManualStatus): void {
  const rt = getRuntime();
  useSessionStore.getState().setSettings({ status });
  setAutoIdle(false);
  publishPresence();
  void attempt(() => rt.api.updateSettings({ status }), 'Could not update status');
}

export function UserPanel() {
  const { t } = useI18n();
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
  const status = shownStatus(presence, settingsStatus);
  const customStatus = customStatusLine(storedCustom, Date.now());

  const entries: MenuEntry[] = [
    { kind: 'label', label: t('shell.status') },
    ...STATUS_CHOICES.map<MenuEntry>((s) => ({ kind: 'item', label: t(`presence.${s.id}`), checked: (settingsStatus ?? 'online') === s.id, onSelect: () => setStatus(s.id) })),
    { kind: 'separator' },
    { kind: 'item', label: t('shell.customStatus'), onSelect: () => openDialog({ kind: 'customStatus' }) },
    { kind: 'item', label: t('shell.editProfile'), onSelect: () => openSettings({ kind: 'user', tab: 'profile' }) },
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
        aria-label={t('shell.accountStatus')}
      >
        <Avatar id={user.id} name={displayName(user)} avatar={user.avatar} size={34} status={status === 'invisible' ? 'offline' : status} />
        <span className="user-panel-copy">
          <span className="user-panel-name">{displayName(user)}</span>
          <span className="user-panel-sub">{customStatus || t(`presence.${status}`)}</span>
        </span>
      </button>
      <div className="user-panel-actions">
        <span className="split-control">
          <IconButton label={t(selfMute ? 'shell.unmute' : 'shell.mute')} hint={muteKeys} active={selfMute} tone={selfMute ? 'danger' : 'default'} onClick={() => void toggleMute()}>
            {selfMute ? <MicrophoneSlash size={20} /> : <Microphone size={20} />}
          </IconButton>
          <DeviceArrow kind="input" />
        </span>
        <span className="split-control">
          <IconButton label={t(selfDeaf ? 'shell.undeafen' : 'shell.deafen')} hint={deafenKeys} active={selfDeaf} tone={selfDeaf ? 'danger' : 'default'} onClick={() => void toggleDeafen()}>
            {selfDeaf ? <SpeakerSlash size={20} /> : <Headphones size={20} />}
          </IconButton>
          <DeviceArrow kind="output" />
        </span>
        <IconButton label={t('settings.user')} onClick={() => openSettings({ kind: 'user', tab: 'account' })}>
          <Gear size={20} />
        </IconButton>
      </div>
      <Menu open={menu !== null} x={menu?.x ?? 0} y={menu?.y ?? 0} entries={entries} onClose={() => setMenu(null)} minWidth={232} />
    </div>
  );
}
