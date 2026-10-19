import { Check, DeviceMobile, Laptop, SignOut, Upload } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePrefsStore, DEFAULT_KEYBINDS, type AccentId, type ThemeId } from '@renderer/application/stores/prefsStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { DELIVERY_MODES, MODE_COPY } from '@renderer/domain/deliveryMode';
import { RINGTONE_OPTIONS, type RingtoneId } from '@renderer/domain/ringtones';
import { Ringtone } from '@renderer/infrastructure/audio/ringtone';
import { keyLabel, uiohookKeycode } from '@renderer/domain/uiohookKeys';
import type { DeliveryMode } from '@shared/contracts/rest';
import type { UpdateStatus } from '@shared/ipc';
import { attempt } from '../../../app/actions';
import { bridge } from '../../../app/bridge';
import { getRuntime } from '../../../app/runtime';
import { describeEvent } from '../../../app/shortcuts';
import { displayName } from '../../../shared/hooks/useNames';
import { Avatar } from '../../../shared/ui/Avatar';
import { Button } from '../../../shared/ui/Button';
import { Field, Input, SettingRow, Segmented, Select, Slider, Switch, TextArea } from '../../../shared/ui/Form';
import { ModeBadge } from '../../privacy/ModeBadge';
import { ConnectionPicker } from '../../auth/ConnectionPicker';
import { readImageUpload } from '../imageUpload';
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
  const openDialog = useUiStore((s) => s.openDialog);
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
      <SettingRow title="Sign out" description="Removes your session from this device's keychain. Your encrypted local history stays on disk until you delete it.">
        <Button
          variant="danger"
          icon={<SignOut size={16} />}
          onClick={() =>
            openDialog({ kind: 'confirm', title: 'Sign out?', body: `You will need to sign in again to use ${BRAND.displayName} on this device.`, confirmLabel: 'Sign out', danger: true, onConfirm: async () => { useUiStore.getState().openSettings(null); await getRuntime().session.logout(); } })
          }
        >
          Sign out
        </Button>
      </SettingRow>
    </Page>
  );
}

export function ProfileTab() {
  const user = useSessionStore((s) => s.user);
  const [globalName, setGlobalName] = useState(user?.global_name ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [accent, setAccent] = useState(user?.accent_color ? `#${user.accent_color.toString(16).padStart(6, '0')}` : '#7c6cf0');
  const [avatar, setAvatar] = useState<string | undefined>();
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!user) return null;
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
          <Field label="About me">{(id) => <TextArea id={id} value={bio} maxLength={190} onChange={(e) => setBio(e.target.value)} />}</Field>
          <Field label="Profile colour">{(id) => <input id={id} type="color" className="color-input" value={accent} onChange={(e) => setAccent(e.target.value)} />}</Field>
        </div>
      </div>
      <div className="row-end"><Button variant="primary" loading={saving} onClick={() => void save()}>Save changes</Button></div>
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
    <Page title="Devices" sub="Devices that can receive your encrypted messages.">
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
      <h3>Camera</h3>
      <Field label="Camera">{(id) => <Select id={id} value={prefs.cameraDeviceId ?? ''} onChange={(e) => prefs.set('cameraDeviceId', e.target.value || null)}><option value="">System default</option>{options('videoinput')}</Select>}</Field>
      <div className="camera-preview">{capturing ? <video ref={preview} autoPlay muted playsInline /> : <Button onClick={() => setCapturing(true)}>Test video</Button>}</div>
    </Page>
  );
}

export function KeybindsTab() {
  const keybinds = usePrefsStore((s) => s.keybinds);
  const patch = usePrefsStore((s) => s.patch);
  const [recording, setRecording] = useState<string | null>(null);
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
      patch({ keybinds: keybinds.map((k) => (k.id === recording ? { ...k, keys: describeEvent(e) } : k)) });
      setRecording(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, keybinds, patch]);
  const labels: Record<string, string> = { palette: 'Command palette', toggleMute: 'Toggle mute', toggleDeafen: 'Toggle deafen', markRead: 'Mark channel as read', search: 'Search', upload: 'Upload a file', prevChannel: 'Previous channel', nextChannel: 'Next channel' };
  return (
    <Page title="Keybinds" sub="In-app shortcuts. Push-to-talk is configured under Voice and video.">
      {keybinds.map((k) => (
        <SettingRow key={k.id} title={labels[k.action] ?? k.action}>
          <Button onClick={() => setRecording(k.id)} aria-label={`Change shortcut for ${labels[k.action]}`}><kbd className="kbd">{recording === k.id ? 'Press keys' : k.keys}</kbd></Button>
        </SettingRow>
      ))}
      <div className="row-end"><Button variant="ghost" onClick={() => patch({ keybinds: DEFAULT_KEYBINDS })}>Reset to defaults</Button></div>
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
      <SettingRow title="Message density" description="Compact fits more messages on screen."><Segmented label="Message density" value={prefs.density} onChange={(v) => prefs.set('density', v)} options={[{ value: 'cozy', label: 'Cozy' }, { value: 'compact', label: 'Compact' }]} /></SettingRow>
      <SettingRow title="Text size"><Slider label="Text size" value={prefs.fontScale} min={0.85} max={1.3} step={0.05} onChange={(v) => prefs.set('fontScale', v)} format={(v) => `${Math.round(v * 100)}%`} /></SettingRow>
      <SettingRow title="Reduce motion" description="Replaces springs with instant changes and keeps the speaking ring static."><Switch label="Reduce motion" checked={prefs.reduceMotion} onChange={(v) => prefs.set('reduceMotion', v)} /></SettingRow>
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
      <SettingRow title="Notification sounds"><Switch label="Notification sounds" checked={prefs.notifySounds} onChange={(v) => prefs.set('notifySounds', v)} /></SettingRow>
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
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });
  useEffect(() => bridge?.updates.onStatus(setStatus), []);
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
