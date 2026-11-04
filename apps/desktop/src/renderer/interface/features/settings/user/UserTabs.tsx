import { Check, DeviceMobile, Laptop, SignOut, Upload } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePrefsStore, type AccentId, type ThemeId } from '@discordy/core/application/stores/prefsStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { DELIVERY_MODES, MODE_COPY } from '@discordy/core/domain/deliveryMode';
import { SOUND_OPTIONS } from '@discordy/core/domain/sounds';
import { soundEffects } from '@renderer/infrastructure/audio/sfx';
import { RINGTONE_OPTIONS, type RingtoneId } from '@discordy/core/domain/ringtones';
import { VIDEO_PRESETS, type VideoPresetId } from '@discordy/core/domain/videoPresets';
import { Ringtone } from '@renderer/infrastructure/audio/ringtone';
import { keyLabel, uiohookKeycode } from '@discordy/core/domain/uiohookKeys';
import type { DeliveryMode } from '@discordy/core/contracts/rest';
import { IDLE_TIMEOUT_CHOICES, type DesktopSettings } from '@shared/ipc';
import { useUpdateStore } from '@discordy/core/application/stores/updateStore';
import { speak } from '@renderer/infrastructure/tts';
import { BIO_MAX_LENGTH } from '@discordy/core/domain/profile';
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, clampZoom } from '@discordy/core/domain/appearance';
import { attempt } from '../../../app/actions';
import { bridge } from '../../../app/bridge';
import { getRuntime } from '../../../app/runtime';
import { displayName } from '../../../shared/hooks/useNames';
import { Avatar } from '../../../shared/ui/Avatar';
import { Button } from '../../../shared/ui/Button';
import { UnsavedBar } from '../../../shared/ui/UnsavedBar';
import { Field, Input, SettingRow, Segmented, Select, Slider, Switch, TextArea } from '../../../shared/ui/Form';
import { ModeBadge } from '../../privacy/ModeBadge';
import { ConnectionPicker } from '../../auth/ConnectionPicker';
import { readImageUpload } from '../imageUpload';
import { confirmLogout } from '../logout';
import { KeybindsEditor } from './KeybindsEditor';
import { AccountSecurity } from './AccountSecurity';
import { SessionsList } from './SessionsList';
import { BRAND } from '@shared/brand';

function Page({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="settings-page">
      <h1>{title}</h1>
      {sub && <p className="page-sub">{sub}</p>}
      {children}
    </div>
  );
}

export function AccountTab() {
  const user = useSessionStore((s) => s.user);
  const openSettings = useUiStore((s) => s.openSettings);
  if (!user) return null;
  return (
    <Page title="My account">
      <div className="account-card">
        <Avatar id={user.id} name={displayName(user)} avatar={user.avatar} size={72} />
        <div>
          <h2>{displayName(user)}</h2>
          <p className="mono">{user.username}</p>
          {user.email && <p className="setting-desc">{user.email}</p>}
        </div>
        <Button onClick={() => openSettings({ kind: 'user', tab: 'profile' })}>Edit profile</Button>
      </div>
      <AccountSecurity user={user} />
      <SettingRow title="Log out" description="Removes your session from this device's keychain. Your encrypted local history stays on disk until you delete it.">
        <Button
          variant="danger"
          icon={<SignOut size={16} />}
          onClick={confirmLogout}
        >
          Log out
        </Button>
      </SettingRow>
    </Page>
  );
}

export function ProfileTab() {
  const user = useSessionStore((s) => s.user);
  const [globalName, setGlobalName] = useState(user?.global_name ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const savedAccent = user?.accent_color ? `#${user.accent_color.toString(16).padStart(6, '0')}` : '#7c6cf0';
  const [accent, setAccent] = useState(savedAccent);
  const [avatar, setAvatar] = useState<string | undefined>();
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!user) return null;
  const dirty = globalName !== (user.global_name ?? '') || bio !== (user.bio ?? '') || accent !== savedAccent || avatar !== undefined;
  const reset = () => {
    setGlobalName(user.global_name ?? '');
    setBio(user.bio ?? '');
    setAccent(savedAccent);
    setAvatar(undefined);
    setAvatarError(null);
  };
  const chooseAvatar = async (file: File | undefined) => {
    if (!file) return;
    try {
      setAvatar(await readImageUpload(file));
      setAvatarError(null);
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : 'Could not read the image.');
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await attempt(() => getRuntime().api.updateMe({ global_name: globalName || null, bio, accent_color: parseInt(accent.slice(1), 16), ...(avatar ? { avatar } : {}) }), 'Could not save profile');
      if (updated) {
        useSessionStore.getState().setUser(updated);
        setAvatar(undefined);
      }
    } finally {
      setSaving(false);
    }
  };
  return (
    <Page title="Profile" sub="How you appear to others.">
      <div className="overview-row">
        <button type="button" className="icon-upload is-round" onClick={() => fileRef.current?.click()} aria-label="Change avatar">
          {avatar ? <img src={avatar} alt="" /> : <Avatar id={user.id} name={displayName(user)} avatar={user.avatar} size={96} />}
          <span><Upload size={18} /> Change</span>
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => void chooseAvatar(e.target.files?.[0])} />
        {avatarError && <p className="field-error" role="alert">{avatarError}</p>}
        <div className="stack grow">
          <Field label="Display name">{(id) => <Input id={id} value={globalName} maxLength={32} placeholder={user.username} onChange={(e) => setGlobalName(e.target.value)} />}</Field>
          <Field label="About me">{(id) => <TextArea id={id} value={bio} maxLength={BIO_MAX_LENGTH} onChange={(e) => setBio(e.target.value)} />}</Field>
          <Field label="Profile colour">{(id) => <input id={id} type="color" className="color-input" value={accent} onChange={(e) => setAccent(e.target.value)} />}</Field>
        </div>
      </div>
      <UnsavedBar dirty={dirty} saving={saving} onReset={reset} onSave={() => void save()} />
    </Page>
  );
}

export function PrivacyTab() {
  const settings = useSessionStore((s) => s.settings);
  const identity = useSessionStore((s) => s.identityKeyB64);
  const [crypto, setCrypto] = useState<{ available: boolean; reason?: string } | null>(null);
  useEffect(() => {
    void bridge?.crypto.status().then(setCrypto);
  }, []);
  const choose = (mode: DeliveryMode) => void attempt(() => getRuntime().privacy.sender.setDefaultMode(mode), 'Could not update default');
  const overrides = Object.entries(settings.delivery_overrides ?? {});
  return (
    <Page title="Privacy and delivery" sub="Choose how your direct messages travel. The strictest setting among participants wins.">
      <div className="mode-cards" role="radiogroup" aria-label="Default delivery mode for new direct messages">
        {DELIVERY_MODES.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={settings.default_delivery_mode === m} className={`mode-card mode-${m}${settings.default_delivery_mode === m ? ' is-on' : ''}`} onClick={() => choose(m)} disabled={m !== 'standard' && crypto !== null && !crypto.available}>
            <ModeBadge mode={m} />
            <p>{MODE_COPY[m].description}</p>
            {settings.default_delivery_mode === m && <span className="mode-card-check"><Check size={16} weight="bold" /></span>}
          </button>
        ))}
      </div>
      {crypto && !crypto.available && (
        <p className="settings-warning" role="alert">Encrypted modes are unavailable on this install: {crypto.reason ?? 'the native crypto module did not load'}. Nothing is ever sent unencrypted in a private mode.</p>
      )}
      <h3>Calls</h3>
      <SettingRow title="Encrypt all my calls end-to-end" description="Applies to DMs, group DMs, voice channels and Go Live. If anyone in a call has this on, the whole call is encrypted.">
        <Switch label="Encrypt all my calls end-to-end" checked={settings.e2ee_calls_default === true} disabled={crypto !== null && !crypto.available} onChange={(v) => void attempt(() => getRuntime().privacy.sender.setE2eeCallsDefault(v), 'Could not update calls setting')} />
      </SettingRow>
      <h3>Per-chat overrides</h3>
      {overrides.length === 0 ? <p className="setting-desc">No chats override your default. Change a chat's mode from its composer.</p> : (
        <ul className="manage-list">
          {overrides.map(([cid, mode]) => (
            <li key={cid}><div className="manage-copy"><strong className="mono">{cid}</strong></div><ModeBadge mode={mode} compact /><Button size="sm" variant="ghost" onClick={() => void attempt(async () => { await getRuntime().api.setChannelDeliveryOverride(cid, null); const next = { ...(settings.delivery_overrides ?? {}) }; delete next[cid]; useSessionStore.getState().setSettings({ delivery_overrides: next }); }, 'Could not clear override')}>Clear</Button></li>
          ))}
        </ul>
      )}
      <h3>This device's identity</h3>
      <p className="setting-desc">Your device signs its P2P connections and MLS credentials with this key. Others see it as your device fingerprint.</p>
      <code className="fingerprint selectable">{identity ?? 'No identity: native crypto is unavailable.'}</code>
    </Page>
  );
}

export function DevicesTab() {
  const me = useSessionStore((s) => s.user?.id);
  const current = useSessionStore((s) => s.deviceId);
  const devices = useQuery({ queryKey: ['devices', me], queryFn: () => getRuntime().api.listUserDevices(me!), enabled: Boolean(me) });
  return (
    <Page title="Devices" sub="Where you are logged in, and the devices that can receive your encrypted messages.">
      <SessionsList />
      <h2>Encrypted-message devices</h2>
      <ul className="manage-list">
        {devices.data?.map((d) => (
          <li key={d.device_id}>
            {d.device_id === current ? <Laptop size={26} weight="duotone" /> : <DeviceMobile size={26} weight="duotone" />}
            <div className="manage-copy"><strong>{d.device_id === current ? 'This device' : 'Device'} <span className="mono">{d.device_id}</span></strong><span className="mono fingerprint-short">{d.identity_key_b64.slice(0, 32)}</span></div>
          </li>
        ))}
        {devices.data?.length === 0 && <li className="pick-empty">No devices registered.</li>}
      </ul>
    </Page>
  );
}

function useInputLevel(enabled: boolean, deviceId: string | null): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true });
        if (stop) return;
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const tick = () => {
          if (stop) return;
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
          setLevel(Math.min(1, peak * 1.6));
          requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setLevel(0);
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
    };
  }, [enabled, deviceId]);
  return level;
}

export function VoiceTab() {
  const prefs = usePrefsStore();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [pttListening, setPttListening] = useState(false);
  const [pttNote, setPttNote] = useState<string | null>(null);
  const level = useInputLevel(true, prefs.inputDeviceId);
  const preview = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const load = () => void navigator.mediaDevices.enumerateDevices().then(setDevices).catch(() => setDevices([]));
    load();
    navigator.mediaDevices.addEventListener('devicechange', load);
    return () => navigator.mediaDevices.removeEventListener('devicechange', load);
  }, []);
  useEffect(() => {
    if (!capturing) return;
    let stream: MediaStream | null = null;
    void navigator.mediaDevices.getUserMedia({ video: prefs.cameraDeviceId ? { deviceId: { exact: prefs.cameraDeviceId } } : true }).then((s) => {
      stream = s;
      if (preview.current) preview.current.srcObject = s;
    }).catch(() => setCapturing(false));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [capturing, prefs.cameraDeviceId]);
  useEffect(() => {
    if (!pttListening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      setPttListening(false);
      const code = uiohookKeycode(e.code);
      if (code === null) { setPttNote('That key cannot be used for push-to-talk.'); return; }
      void (async () => {
        const ok = (await bridge?.hotkeys.setPushToTalk(code)) ?? false;
        if (ok) { prefs.patch({ pttKeycode: code, pttLabel: keyLabel(e.code) }); setPttNote(null); }
        else setPttNote(`Global key capture is unavailable on this system, so push-to-talk only works while ${BRAND.displayName} is focused.`);
        if (!ok) prefs.patch({ pttKeycode: code, pttLabel: keyLabel(e.code) });
      })();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [pttListening, prefs]);

  const options = (kind: MediaDeviceKind) => devices.filter((d) => d.kind === kind).map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `${kind} ${d.deviceId.slice(0, 6)}`}</option>);
  return (
    <Page title="Voice and video">
      <div className="two-col">
        <Field label="Input device">{(id) => <Select id={id} value={prefs.inputDeviceId ?? ''} onChange={(e) => prefs.set('inputDeviceId', e.target.value || null)}><option value="">System default</option>{options('audioinput')}</Select>}</Field>
        <Field label="Output device">{(id) => <Select id={id} value={prefs.outputDeviceId ?? ''} onChange={(e) => prefs.set('outputDeviceId', e.target.value || null)}><option value="">System default</option>{options('audiooutput')}</Select>}</Field>
      </div>
      <div className="two-col">
        <Field label="Input volume">{() => <Slider label="Input volume" value={prefs.inputVolume} min={0} max={2} step={0.05} onChange={(v) => prefs.set('inputVolume', v)} format={(v) => `${Math.round(v * 100)}%`} />}</Field>
        <Field label="Output volume">{() => <Slider label="Output volume" value={prefs.outputVolume} min={0} max={2} step={0.05} onChange={(v) => prefs.set('outputVolume', v)} format={(v) => `${Math.round(v * 100)}%`} />}</Field>
      </div>
      <Field label="Mic test" hint="Speak to see your input level.">
        {() => (
          <div className="meter" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={1} aria-valuenow={level}>
            <span className="meter-fill" style={{ transform: `scaleX(${level})` }} />
            {prefs.inputMode === 'vad' && <span className="meter-threshold" style={{ left: `${prefs.vadThreshold * 100}%` }} />}
          </div>
        )}
      </Field>
      <SettingRow title="Input mode"><Segmented label="Input mode" value={prefs.inputMode} onChange={(v) => prefs.set('inputMode', v)} options={[{ value: 'vad', label: 'Voice activity' }, { value: 'ptt', label: 'Push to talk' }]} /></SettingRow>
      {prefs.inputMode === 'vad' ? (
        <SettingRow title="Sensitivity" description="Speech above the marker opens the microphone."><Slider label="Voice activity threshold" value={prefs.vadThreshold} min={0.02} max={0.6} step={0.01} onChange={(v) => prefs.set('vadThreshold', v)} /></SettingRow>
      ) : (
        <>
          <SettingRow title="Push-to-talk key" description="Works system-wide while the app is in the background.">
            <Button onClick={() => setPttListening(true)}>{pttListening ? 'Press a key' : (prefs.pttLabel ?? 'Set key')}</Button>
          </SettingRow>
          {pttNote && <p className="settings-warning" role="status">{pttNote}</p>}
          <SettingRow title="Release delay" description="Keeps the microphone open briefly after you let go."><Slider label="Release delay" value={prefs.pttReleaseDelayMs} min={0} max={1000} step={50} onChange={(v) => prefs.set('pttReleaseDelayMs', v)} format={(v) => `${v} ms`} /></SettingRow>
        </>
      )}
      <SettingRow title="Noise suppression" description="RNNoise removes steady background noise on your device."><Switch label="Noise suppression" checked={prefs.noiseSuppression} onChange={(v) => prefs.set('noiseSuppression', v)} /></SettingRow>
      <SettingRow title="Echo cancellation"><Switch label="Echo cancellation" checked={prefs.echoCancellation} onChange={(v) => prefs.set('echoCancellation', v)} /></SettingRow>
      <SettingRow title="Automatic gain control"><Switch label="Automatic gain control" checked={prefs.autoGain} onChange={(v) => prefs.set('autoGain', v)} /></SettingRow>
      <SettingRow title="Confirm before calling" description="Asks before a voice or video call starts ringing someone, to prevent accidental calls."><Switch label="Confirm before calling" checked={prefs.confirmCalls} onChange={(v) => prefs.set('confirmCalls', v)} /></SettingRow>
      <h3>Camera</h3>
      <Field label="Camera">{(id) => <Select id={id} value={prefs.cameraDeviceId ?? ''} onChange={(e) => prefs.set('cameraDeviceId', e.target.value || null)}><option value="">System default</option>{options('videoinput')}</Select>}</Field>
      <Field label="Camera quality">{(id) => <Select id={id} value={prefs.cameraPreset} onChange={(e) => prefs.set('cameraPreset', e.target.value as VideoPresetId)}>{VIDEO_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select>}</Field>
      <div className="camera-preview">{capturing ? <video ref={preview} autoPlay muted playsInline /> : <Button onClick={() => setCapturing(true)}>Test video</Button>}</div>
    </Page>
  );
}

export function KeybindsTab() {
  return (
    <Page title="Keybinds" sub="Shortcuts are saved on this device only. Global shortcuts also work while the app is in the background (desktop app). Press Esc while recording to cancel.">
      <KeybindsEditor />
    </Page>
  );
}

const ACCENTS: { id: AccentId; label: string; hue: number; chroma: number }[] = [
  { id: 'iris', label: 'Iris', hue: 275, chroma: 0.2 }, { id: 'aurora', label: 'Aurora', hue: 175, chroma: 0.14 }, { id: 'ember', label: 'Ember', hue: 45, chroma: 0.17 },
  { id: 'rose', label: 'Rose', hue: 5, chroma: 0.2 }, { id: 'citrine', label: 'Citrine', hue: 100, chroma: 0.16 }, { id: 'sky', label: 'Sky', hue: 235, chroma: 0.16 },
];

export function AppearanceTab() {
  const prefs = usePrefsStore();
  const themes: { id: ThemeId; label: string }[] = [{ id: 'dark', label: 'Dark' }, { id: 'oled', label: 'OLED' }, { id: 'light', label: 'Light' }];
  return (
    <Page title="Appearance">
      <h3>Theme</h3>
      <div className="theme-cards" role="radiogroup" aria-label="Theme">
        {themes.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={prefs.theme === t.id} className={`theme-card${prefs.theme === t.id ? ' is-on' : ''}`} data-theme={t.id} onClick={() => prefs.set('theme', t.id)}>
            <span className="theme-preview"><i /><i /><i /></span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <h3>Accent</h3>
      <div className="accent-row" role="radiogroup" aria-label="Accent colour">
        {ACCENTS.map((a) => (
          <button key={a.id} type="button" role="radio" aria-checked={prefs.accent === a.id} aria-label={a.label} title={a.label} className={`accent-dot${prefs.accent === a.id ? ' is-on' : ''}`} style={{ background: `oklch(0.7 ${a.chroma} ${a.hue})` }} onClick={() => prefs.set('accent', a.id)}>
            {prefs.accent === a.id && <Check size={14} weight="bold" />}
          </button>
        ))}
      </div>
      <SettingRow title="Sync with computer" description="Follow the light or dark setting of your operating system. A dark computer keeps the dark variant chosen above. This device only."><Switch label="Sync theme with computer" checked={prefs.syncOsTheme} onChange={(v) => prefs.set('syncOsTheme', v)} /></SettingRow>
      <SettingRow title="Message density" description="Compact fits more messages on screen."><Segmented label="Message density" value={prefs.density} onChange={(v) => prefs.set('density', v)} options={[{ value: 'cozy', label: 'Cozy' }, { value: 'compact', label: 'Compact' }]} /></SettingRow>
      {prefs.density === 'compact' && <SettingRow title="Show avatars in compact" description="Keep avatars next to message groups in compact mode."><Switch label="Show avatars in compact" checked={prefs.showAvatarsInCompact} onChange={(v) => prefs.set('showAvatarsInCompact', v)} /></SettingRow>}
      <SettingRow title="Space between message groups" description="Pixels between messages from different people. Follows your account."><Slider label="Space between message groups" value={prefs.messageSpacing} min={0} max={32} step={4} onChange={(v) => prefs.set('messageSpacing', v)} format={(v) => `${v}px`} /></SettingRow>
      <SettingRow title="Channel list density" description="Row height in the channel and direct message lists. This device only."><Segmented label="Channel list density" value={prefs.channelListDensity} onChange={(v) => prefs.set('channelListDensity', v)} options={[{ value: 'cozy', label: 'Cozy' }, { value: 'compact', label: 'Compact' }]} /></SettingRow>
      <SettingRow title="Text size"><Slider label="Text size" value={prefs.fontScale} min={0.85} max={1.3} step={0.05} onChange={(v) => prefs.set('fontScale', v)} format={(v) => `${Math.round(v * 100)}%`} /></SettingRow>
      <SettingRow title="Zoom" description="Scales the whole window. Ctrl and plus or minus zoom, Ctrl and 0 resets. This device only.">
        <div className="setting-inline">
          <Slider label="Zoom" value={prefs.zoom} min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP} onChange={(v) => prefs.set('zoom', clampZoom(v))} format={(v) => `${Math.round(v * 100)}%`} />
          <Button variant="ghost" disabled={prefs.zoom === 1} onClick={() => prefs.set('zoom', 1)}>Reset</Button>
        </div>
      </SettingRow>
    </Page>
  );
}

export function AccessibilityTab() {
  const prefs = usePrefsStore();
  const test = () => speak('This is how text to speech sounds at this speed.', prefs.ttsRate);
  return (
    <Page title="Accessibility" sub="Applies at once and, except where noted, follows your account to every device.">
      <h3>Motion</h3>
      <SettingRow title="Sync with computer" description="Reduce motion whenever your operating system asks for it. This device only."><Switch label="Sync reduced motion with computer" checked={prefs.syncOsMotion} onChange={(v) => prefs.set('syncOsMotion', v)} /></SettingRow>
      <SettingRow title="Reduce motion" description="Replaces springs with instant changes and keeps the speaking ring static."><Switch label="Reduce motion" checked={prefs.reduceMotion} onChange={(v) => prefs.set('reduceMotion', v)} /></SettingRow>
      <SettingRow title="Play GIFs automatically" description="When off, GIFs show their first frame and play when you point at them."><Switch label="Play GIFs automatically" checked={prefs.animateGifs} onChange={(v) => prefs.set('animateGifs', v)} /></SettingRow>
      <SettingRow title="Animate emoji" description="Custom emoji that move."><Switch label="Animate emoji" checked={prefs.animateEmoji} onChange={(v) => prefs.set('animateEmoji', v)} /></SettingRow>
      <SettingRow title="Animate stickers" description="Stickers that move."><Switch label="Animate stickers" checked={prefs.animateStickers} onChange={(v) => prefs.set('animateStickers', v)} /></SettingRow>
      <h3>Colour and contrast</h3>
      <SettingRow title="Saturation" description="Lower it to mute every colour in the app."><Slider label="Saturation" value={prefs.saturation} min={0} max={1} step={0.05} onChange={(v) => prefs.set('saturation', v)} format={(v) => `${Math.round(v * 100)}%`} /></SettingRow>
      <SettingRow title="Role colours" description="How the top role colour of a member shows beside their name."><Segmented label="Role colours" value={prefs.roleColors} onChange={(v) => prefs.set('roleColors', v)} options={[{ value: 'name', label: 'In the name' }, { value: 'dot', label: 'As a dot' }, { value: 'hidden', label: 'Hidden' }]} /></SettingRow>
      <SettingRow title="High contrast" description="Stronger text and visible edges on buttons and fields. Windows high contrast mode is respected automatically."><Switch label="High contrast" checked={prefs.highContrast} onChange={(v) => prefs.set('highContrast', v)} /></SettingRow>
      <SettingRow title="Always underline links"><Switch label="Always underline links" checked={prefs.linkUnderline} onChange={(v) => prefs.set('linkUnderline', v)} /></SettingRow>
      <h3>Text to speech</h3>
      <SettingRow title="Allow playback and use of /tts" description="Type /tts and a message to have it read aloud, and hear text-to-speech messages in the channel you are looking at. Sending needs the Send Text-to-Speech Messages permission."><Switch label="Allow text to speech" checked={prefs.ttsReadAloud} onChange={(v) => prefs.set('ttsReadAloud', v)} /></SettingRow>
      <SettingRow title="Speech rate">
        <div className="setting-inline">
          <Slider label="Speech rate" value={prefs.ttsRate} min={0.5} max={2} step={0.25} onChange={(v) => prefs.set('ttsRate', v)} format={(v) => `${v}x`} />
          <Button variant="secondary" onClick={test}>Test</Button>
        </div>
      </SettingRow>
      <h3>Keyboard</h3>
      <p className="setting-desc">Every list and menu moves with the arrow keys, Tab shows a focus ring, Shift and F10 opens the context menu of the focused item, and Ctrl and / lists all shortcuts.</p>
    </Page>
  );
}

const preview = new Ringtone();
let previewTimer: ReturnType<typeof setTimeout> | null = null;

/** Plays the ringtone for a few seconds on the chosen output device. */
function previewRingtone(tone: RingtoneId, volume: number, outputDeviceId: string | null): void {
  preview.stop();
  if (previewTimer) clearTimeout(previewTimer);
  preview.start(outputDeviceId, { tone, volume });
  previewTimer = setTimeout(() => preview.stop(), 3_000);
}

export function NotificationsTab() {
  const prefs = usePrefsStore();
  return (
    <Page title="Notifications">
      <SettingRow title="Desktop notifications" description="Shown for mentions and direct messages."><Switch label="Desktop notifications" checked={prefs.notifyDesktop} onChange={(v) => prefs.set('notifyDesktop', v)} /></SettingRow>
      <SettingRow title="Only mentions"><Switch label="Only mentions" checked={prefs.notifyOnlyMentions} onChange={(v) => prefs.set('notifyOnlyMentions', v)} /></SettingRow>
      <SettingRow title="Notification sounds" description="Master switch for call sounds, ringtone and message sounds. Do Not Disturb mutes them."><Switch label="Notification sounds" checked={prefs.notifySounds} onChange={(v) => prefs.set('notifySounds', v)} /></SettingRow>
      {SOUND_OPTIONS.map((o) => (
        <SettingRow key={o.id} title={`Sound: ${o.label}`}>
          <div className="setting-inline">
            <Button variant="secondary" onClick={() => soundEffects.play(o.id, prefs.outputVolume, prefs.outputDeviceId)}>Preview</Button>
            <Switch label={`Sound: ${o.label}`} checked={prefs.notifySounds && prefs.soundToggles[o.id] !== false} onChange={(v) => prefs.set('soundToggles', { ...prefs.soundToggles, [o.id]: v })} />
          </div>
        </SettingRow>
      ))}
      <Field label="Ringtone">
        {(id) => (
          <div className="setting-inline">
            <Select id={id} value={prefs.ringtone} onChange={(e) => prefs.set('ringtone', e.target.value as RingtoneId)}>
              {RINGTONE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </Select>
            <Button variant="secondary" onClick={() => previewRingtone(prefs.ringtone, prefs.ringtoneVolume, prefs.outputDeviceId)}>Preview</Button>
          </div>
        )}
      </Field>
      <Field label="Ringtone volume">{() => <Slider label="Ringtone volume" value={prefs.ringtoneVolume} min={0} max={1} step={0.05} onChange={(v) => prefs.set('ringtoneVolume', v)} format={(v) => `${Math.round(v * 100)}%`} />}</Field>
      <SettingRow title="Flash taskbar"><Switch label="Flash taskbar" checked={prefs.flashTaskbar} onChange={(v) => prefs.set('flashTaskbar', v)} /></SettingRow>
      <p className="setting-desc">Notifications for encrypted chats show only the sender's name; message text is never put in notification text for private modes.</p>
    </Page>
  );
}

export function ConnectionTab() {
  const info = useSessionStore((s) => s.appInfo);
  const [open, setOpen] = useState(false);
  if (!info) return null;
  return (
    <Page title="Connection" sub="Where this app connects.">
      {(['apiUrl', 'gatewayUrl', 'cdnUrl'] as const).map((k) => <SettingRow key={k} title={k === 'apiUrl' ? 'API' : k === 'gatewayUrl' ? 'Gateway' : 'CDN'}><code className="mono">{info.connection[k]}</code></SettingRow>)}
      <SettingRow title="Profile" description="Environment variables DISCORDY_PROFILE, DISCORDY_API_URL, DISCORDY_GATEWAY_URL and DISCORDY_CDN_URL override this."><Button onClick={() => setOpen(true)}>{info.connection.id}, change</Button></SettingRow>
      <ConnectionPicker open={open} onClose={() => setOpen(false)} />
    </Page>
  );
}

export function AboutTab() {
  const info = useSessionStore((s) => s.appInfo);
  const status = useUpdateStore((s) => s.status);
  const label = status.state === 'checking' ? 'Checking for updates' : status.state === 'available' ? `Version ${status.version} is available` : status.state === 'downloading' ? `Downloading ${Math.round(status.percent)}%` : status.state === 'downloaded' ? `Version ${status.version} is ready to install` : status.state === 'not-available' ? 'You are up to date' : status.state === 'error' ? `Update check failed: ${status.message}` : null;
  return (
    <Page title="About and updates">
      <SettingRow title="Version"><span className="mono">{info?.version}</span></SettingRow>
      <SettingRow title="Platform"><span className="mono">{info?.platform}</span></SettingRow>
      <SettingRow title="Update feed"><span className="mono">{info?.updateFeedUrl || 'none'}</span></SettingRow>
      <div className="row-start">
        {status.state === 'downloaded' ? <Button variant="primary" onClick={() => bridge?.updates.install()}>Restart and install</Button> : <Button disabled={!bridge || status.state === 'checking'} onClick={() => void bridge?.updates.check()}>Check for updates</Button>}
        {label && <span role="status" className="setting-desc">{label}</span>}
      </div>
    </Page>
  );
}

export function DesktopTab() {
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [restart, setRestart] = useState(false);
  useEffect(() => {
    void bridge?.desktop.get().then(setSettings);
  }, []);
  if (!bridge) return <Page title="Desktop" sub="These options are available in the desktop app."><p className="setting-desc">Open this page in the installed app to change them.</p></Page>;
  const change = (patch: Partial<DesktopSettings>) => {
    void bridge?.desktop.set(patch).then((r) => {
      setSettings(r.settings);
      if (r.restartRequired) setRestart(true);
    });
  };
  const row = (key: Exclude<keyof DesktopSettings, 'idleTimeoutMinutes'>, title: string, description: string, disabled = false) => (
    <SettingRow title={title} description={description}>
      <Switch label={title} checked={settings?.[key] ?? false} disabled={!settings || disabled} onChange={(v) => change({ [key]: v })} />
    </SettingRow>
  );
  return (
    <Page title="Desktop" sub="Saved on this device only; they do not follow your account.">
      {row('openAtLogin', `Open ${BRAND.displayName}`, 'Start the app when you sign in to your computer.')}
      {row('showTray', 'Show in system tray', 'Keep an icon in the system tray with a menu and your unread state. When off, closing the window quits the app.')}
      {row('startMinimized', 'Start minimized', 'When started at login, stay in the tray instead of opening the window.', !settings?.openAtLogin || !settings.showTray)}
      {row('minimizeToTray', 'Minimize to tray', 'The minimize button hides the window to the tray instead of the taskbar.', !settings?.showTray)}
      {row('closeToTray', 'Close button minimizes to tray', 'The close button hides the window to the tray. Quit from the tray menu.', !settings?.showTray)}
      {row('hardwareAcceleration', 'Hardware acceleration', 'Use the GPU for rendering. Turn off if you see glitches. Takes effect after a restart.')}
      <SettingRow title="Go idle automatically" description="Show as Idle after this long without keyboard or mouse input, and when the screen locks. Do Not Disturb and Invisible are never changed.">
        <Select aria-label="Idle timeout" value={String(settings?.idleTimeoutMinutes ?? 10)} disabled={!settings} onChange={(e) => change({ idleTimeoutMinutes: Number(e.target.value) })}>
          {IDLE_TIMEOUT_CHOICES.map((m) => <option key={m} value={m}>{m === 0 ? 'Never' : m === 60 ? '1 hour' : `${m} minute${m === 1 ? '' : 's'}`}</option>)}
        </Select>
      </SettingRow>
      {restart && (
        <div className="row-start">
          <span role="status" className="setting-desc">Restart to apply hardware acceleration.</span>
          <Button variant="primary" onClick={() => bridge?.desktop.relaunch()}>Restart now</Button>
        </div>
      )}
    </Page>
  );
}

export function ChatTab() {
  const prefs = usePrefsStore();
  return (
    <Page title="Chat" sub="How messages look and how you send them. These apply to this device.">
      <h3>Display</h3>
      <SettingRow title="Display images and videos" description="Show attachments inside the message instead of as links."><Switch label="Display images and videos" checked={prefs.inlineMedia} onChange={(v) => prefs.set('inlineMedia', v)} /></SettingRow>
      <SettingRow title="Show embeds" description="Rich cards that servers attach to links, such as videos and articles."><Switch label="Show embeds" checked={prefs.inlineEmbeds} onChange={(v) => prefs.set('inlineEmbeds', v)} /></SettingRow>
      <SettingRow title="Show link previews" description="Previews of links in messages, made by the server for standard chats. Follows your account on every device."><Switch label="Show link previews" checked={prefs.linkPreviews} onChange={(v) => prefs.set('linkPreviews', v)} /></SettingRow>
      <SettingRow title="Show spoiler content" description="When hidden text is revealed without a click.">
        <Segmented label="Show spoiler content" value={prefs.spoilerDisplay} onChange={(v) => prefs.set('spoilerDisplay', v)} options={[{ value: 'click', label: 'On click' }, { value: 'moderated', label: 'On servers I moderate' }, { value: 'always', label: 'Always' }]} />
      </SettingRow>
      <SettingRow title="Show reactions" description="Reaction chips under messages."><Switch label="Show reactions" checked={prefs.showReactions} onChange={(v) => prefs.set('showReactions', v)} /></SettingRow>
      <SettingRow title="Compact reply preview" description="Quote the replied-to message on a single line."><Switch label="Compact reply preview" checked={prefs.compactReplyPreview} onChange={(v) => prefs.set('compactReplyPreview', v)} /></SettingRow>
      <h3>Composer</h3>
      <SettingRow title="Convert emoticons" description="Turn :) and similar into emoji as you send."><Switch label="Convert emoticons" checked={prefs.convertEmoticons} onChange={(v) => prefs.set('convertEmoticons', v)} /></SettingRow>
      <SettingRow title="Send with Ctrl+Enter" description="Enter adds a new line and Ctrl+Enter sends the message."><Switch label="Send with Ctrl+Enter" checked={prefs.sendWithCtrlEnter} onChange={(v) => prefs.set('sendWithCtrlEnter', v)} /></SettingRow>
    </Page>
  );
}

export function AdvancedTab() {
  const prefs = usePrefsStore();
  return (
    <Page title="Advanced">
      <SettingRow title="Developer mode" description="Adds Copy ID to the menus of channels, categories, messages and people, so you can use them with bots and the API.">
        <Switch label="Developer mode" checked={prefs.developerMode} onChange={(v) => prefs.set('developerMode', v)} />
      </SettingRow>
    </Page>
  );
}
