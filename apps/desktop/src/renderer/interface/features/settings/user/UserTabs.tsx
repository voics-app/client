import { useI18n } from '../../../shared/i18n';
import { Check, DeviceMobile, Laptop, SignOut, Upload } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePrefsStore, type AccentId, type ThemeId } from '@discordy/core/application/stores/prefsStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { DELIVERY_MODES } from '@discordy/core/domain/deliveryMode';
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
  const { t: msg } = useI18n();
  const user = useSessionStore((s) => s.user);
  const openSettings = useUiStore((s) => s.openSettings);
  if (!user) return null;
  return (
    <Page title={msg("settings.account")}>
      <div className="account-card">
        <Avatar id={user.id} name={displayName(user)} avatar={user.avatar} size={72} />
        <div>
          <h2>{displayName(user)}</h2>
          <p className="mono">{user.username}</p>
          {user.email && <p className="setting-desc">{user.email}</p>}
        </div>
        <Button onClick={() => openSettings({ kind: 'user', tab: 'profile' })}>{msg("shell.editProfile")}</Button>
      </div>
      <AccountSecurity user={user} />
      <SettingRow title={msg("settings.logout")} searchKey="Log out" description={msg("settings.usertabs.removes.your.session.from.this.device.s.keychain.your")}>
        <Button
          variant="danger"
          icon={<SignOut size={16} />}
          onClick={confirmLogout}
        >
          {msg("settings.logout")} </Button>
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
  const { t: msg } = useI18n();
  const settings = useSessionStore((s) => s.settings);
  const identity = useSessionStore((s) => s.identityKeyB64);
  const [crypto, setCrypto] = useState<{ available: boolean; reason?: string } | null>(null);
  useEffect(() => {
    void bridge?.crypto.status().then(setCrypto);
  }, []);
  const choose = (mode: DeliveryMode) => void attempt(() => getRuntime().privacy.sender.setDefaultMode(mode), msg("settings.usertabs.could.not.update.default"));
  const overrides = Object.entries(settings.delivery_overrides ?? {});
  return (
    <Page title={msg("settings.privacy")} sub={msg("settings.usertabs.choose.how.your.direct.messages.travel.the.strictest.setting")}>
      <div className="mode-cards" role="radiogroup" aria-label={msg("settings.usertabs.default.delivery.mode.for.new.direct.messages")}>
        {DELIVERY_MODES.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={settings.default_delivery_mode === m} className={`mode-card mode-${m}${settings.default_delivery_mode === m ? ' is-on' : ''}`} onClick={() => choose(m)} disabled={m !== 'standard' && crypto !== null && !crypto.available}>
            <ModeBadge mode={m} />
            <p>{msg(`mode.${m}Description`, { app: BRAND.displayName })}</p>
            {settings.default_delivery_mode === m && <span className="mode-card-check"><Check size={16} weight="bold" /></span>}
          </button>
        ))}
      </div>
      {crypto && !crypto.available && (
        <p className="settings-warning" role="alert">{msg('settings.cryptoUnavailable', { reason: crypto.reason ?? msg('settings.cryptoMissing') })}</p>
      )}
      <h3>{msg("settings.usertabs.calls")}</h3>
      <SettingRow title={msg("settings.usertabs.encrypt.all.my.calls.end.to.end")} searchKey="Encrypt all my calls end-to-end" description={msg("settings.usertabs.applies.to.dms.group.dms.voice.channels.and.go")}>
        <Switch label={msg("settings.usertabs.encrypt.all.my.calls.end.to.end")} checked={settings.e2ee_calls_default === true} disabled={crypto !== null && !crypto.available} onChange={(v) => void attempt(() => getRuntime().privacy.sender.setE2eeCallsDefault(v), msg("settings.usertabs.could.not.update.calls.setting"))} />
      </SettingRow>
      <h3>{msg("settings.usertabs.per.chat.overrides")}</h3>
      {overrides.length === 0 ? <p className="setting-desc">{msg("settings.usertabs.no.chats.override.your.default.change.a.chat.s")}</p> : (
        <ul className="manage-list">
          {overrides.map(([cid, mode]) => (
            <li key={cid}><div className="manage-copy"><strong className="mono">{cid}</strong></div><ModeBadge mode={mode} compact /><Button size="sm" variant="ghost" onClick={() => void attempt(async () => { await getRuntime().api.setChannelDeliveryOverride(cid, null); const next = { ...(settings.delivery_overrides ?? {}) }; delete next[cid]; useSessionStore.getState().setSettings({ delivery_overrides: next }); }, msg("settings.usertabs.could.not.clear.override"))}>{msg("settings.usertabs.clear")}</Button></li>
          ))}
        </ul>
      )}
      <h3>{msg("settings.usertabs.this.device.s.identity")}</h3>
      <p className="setting-desc">{msg("settings.usertabs.your.device.signs.its.p2p.connections.and.mls.credentials")}</p>
      <code className="fingerprint selectable">{identity ?? msg("settings.usertabs.no.identity.native.crypto.is.unavailable")}</code>
      <h3>{msg("settings.usertabs.safety.centre")}</h3>
      <p className="setting-desc">{msg("settings.usertabs.to.report.a.message.open.its.menu.and.choose")}</p>
      <p className="setting-desc">{msg("settings.usertabs.reports.from.standard.chats.include.the.stored.message.in")}</p>
    </Page>
  );
}

export function DevicesTab() {
  const { t: msg } = useI18n();
  const me = useSessionStore((s) => s.user?.id);
  const current = useSessionStore((s) => s.deviceId);
  const devices = useQuery({ queryKey: ['devices', me], queryFn: () => getRuntime().api.listUserDevices(me!), enabled: Boolean(me) });
  return (
    <Page title={msg("settings.devices")} sub={msg("settings.usertabs.where.you.are.logged.in.and.the.devices.that")}>
      <SessionsList />
      <h2>{msg("settings.usertabs.encrypted.message.devices")}</h2>
      <ul className="manage-list">
        {devices.data?.map((d) => (
          <li key={d.device_id}>
            {d.device_id === current ? <Laptop size={26} weight="duotone" /> : <DeviceMobile size={26} weight="duotone" />}
            <div className="manage-copy"><strong>{d.device_id === current ? msg("settings.usertabs.this.device") : msg("settings.usertabs.device")} <span className="mono">{d.device_id}</span></strong><span className="mono fingerprint-short">{d.identity_key_b64.slice(0, 32)}</span></div>
          </li>
        ))}
        {devices.data?.length === 0 && <li className="pick-empty">{msg("settings.usertabs.no.devices.registered")}</li>}
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
  const { t: msg, number } = useI18n();
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
      if (code === null) { setPttNote(msg("settings.usertabs.that.key.cannot.be.used.for.push.to.talk")); return; }
      void (async () => {
        const ok = (await bridge?.hotkeys.setPushToTalk(code)) ?? false;
        if (ok) { prefs.patch({ pttKeycode: code, pttLabel: keyLabel(e.code) }); setPttNote(null); }
        else setPttNote(msg('settings.pttFallback', { app: BRAND.displayName }));
        if (!ok) prefs.patch({ pttKeycode: code, pttLabel: keyLabel(e.code) });
      })();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [pttListening, prefs, msg]);

  const options = (kind: MediaDeviceKind) => devices.filter((d) => d.kind === kind).map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `${kind} ${d.deviceId.slice(0, 6)}`}</option>);
  return (
    <Page title={msg("settings.voice")}>
      <div className="two-col">
        <Field label={msg("settings.usertabs.input.device")}>{(id) => <Select id={id} value={prefs.inputDeviceId ?? ''} onChange={(e) => prefs.set('inputDeviceId', e.target.value || null)}><option value="">{msg("settings.usertabs.system.default")}</option>{options('audioinput')}</Select>}</Field>
        <Field label={msg("settings.usertabs.output.device")}>{(id) => <Select id={id} value={prefs.outputDeviceId ?? ''} onChange={(e) => prefs.set('outputDeviceId', e.target.value || null)}><option value="">{msg("settings.usertabs.system.default")}</option>{options('audiooutput')}</Select>}</Field>
      </div>
      <div className="two-col">
        <Field label={msg("settings.usertabs.input.volume")}>{() => <Slider label={msg("settings.usertabs.input.volume")} value={prefs.inputVolume} min={0} max={2} step={0.05} onChange={(v) => prefs.set('inputVolume', v)} format={(v) => number(v, { style: 'percent', maximumFractionDigits: 0 })} />}</Field>
        <Field label={msg("settings.usertabs.output.volume")}>{() => <Slider label={msg("settings.usertabs.output.volume")} value={prefs.outputVolume} min={0} max={2} step={0.05} onChange={(v) => prefs.set('outputVolume', v)} format={(v) => number(v, { style: 'percent', maximumFractionDigits: 0 })} />}</Field>
      </div>
      <Field label={msg("settings.usertabs.mic.test")} hint={msg("settings.usertabs.speak.to.see.your.input.level")}>
        {() => (
          <div className="meter" role="meter" aria-label={msg("settings.usertabs.microphone.level")} aria-valuemin={0} aria-valuemax={1} aria-valuenow={level}>
            <span className="meter-fill" style={{ transform: `scaleX(${level})` }} />
            {prefs.inputMode === 'vad' && <span className="meter-threshold" style={{ left: `${prefs.vadThreshold * 100}%` }} />}
          </div>
        )}
      </Field>
      <SettingRow title={msg("settings.usertabs.input.mode")} searchKey="Input mode"><Segmented label={msg("settings.usertabs.input.mode")} value={prefs.inputMode} onChange={(v) => prefs.set('inputMode', v)} options={[{ value: 'vad', label: msg("settings.usertabs.voice.activity") }, { value: 'ptt', label: msg("settings.usertabs.push.to.talk") }]} /></SettingRow>
      {prefs.inputMode === 'vad' ? (
        <SettingRow title={msg("settings.usertabs.sensitivity")} searchKey="Sensitivity" description={msg("settings.usertabs.speech.above.the.marker.opens.the.microphone")}><Slider label={msg("settings.usertabs.voice.activity.threshold")} value={prefs.vadThreshold} min={0.02} max={0.6} step={0.01} onChange={(v) => prefs.set('vadThreshold', v)} /></SettingRow>
      ) : (
        <>
          <SettingRow title={msg("settings.usertabs.push.to.talk.key")} searchKey="Push-to-talk key" description={msg("settings.usertabs.works.system.wide.while.the.app.is.in.the")}>
            <Button onClick={() => setPttListening(true)}>{pttListening ? msg("settings.usertabs.press.a.key") : (prefs.pttLabel ?? msg("settings.usertabs.set.key"))}</Button>
          </SettingRow>
          {pttNote && <p className="settings-warning" role="status">{pttNote}</p>}
          <SettingRow title={msg("settings.usertabs.release.delay")} searchKey="Release delay" description={msg("settings.usertabs.keeps.the.microphone.open.briefly.after.you.let.go")}><Slider label={msg("settings.usertabs.release.delay")} value={prefs.pttReleaseDelayMs} min={0} max={1000} step={50} onChange={(v) => prefs.set('pttReleaseDelayMs', v)} format={(v) => `${number(v)} ms`} /></SettingRow>
        </>
      )}
      <SettingRow title={msg("settings.usertabs.noise.suppression")} searchKey="Noise suppression" description={msg("settings.usertabs.rnnoise.removes.steady.background.noise.on.your.device")}><Switch label={msg("settings.usertabs.noise.suppression")} checked={prefs.noiseSuppression} onChange={(v) => prefs.set('noiseSuppression', v)} /></SettingRow>
      <SettingRow title={msg("settings.usertabs.echo.cancellation")} searchKey="Echo cancellation"><Switch label={msg("settings.usertabs.echo.cancellation")} checked={prefs.echoCancellation} onChange={(v) => prefs.set('echoCancellation', v)} /></SettingRow>
      <SettingRow title={msg("settings.usertabs.automatic.gain.control")} searchKey="Automatic gain control"><Switch label={msg("settings.usertabs.automatic.gain.control")} checked={prefs.autoGain} onChange={(v) => prefs.set('autoGain', v)} /></SettingRow>
      <SettingRow title={msg("settings.usertabs.confirm.before.calling")} searchKey="Confirm before calling" description={msg("settings.usertabs.asks.before.a.voice.or.video.call.starts.ringing")}><Switch label={msg("settings.usertabs.confirm.before.calling")} checked={prefs.confirmCalls} onChange={(v) => prefs.set('confirmCalls', v)} /></SettingRow>
      <h3>{msg("settings.usertabs.camera")}</h3>
      <Field label={msg("settings.usertabs.camera")}>{(id) => <Select id={id} value={prefs.cameraDeviceId ?? ''} onChange={(e) => prefs.set('cameraDeviceId', e.target.value || null)}><option value="">{msg("settings.usertabs.system.default")}</option>{options('videoinput')}</Select>}</Field>
      <Field label={msg("settings.usertabs.camera.quality")}>{(id) => <Select id={id} value={prefs.cameraPreset} onChange={(e) => prefs.set('cameraPreset', e.target.value as VideoPresetId)}>{VIDEO_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select>}</Field>
      <div className="camera-preview">{capturing ? <video ref={preview} autoPlay muted playsInline /> : <Button onClick={() => setCapturing(true)}>{msg("settings.usertabs.test.video")}</Button>}</div>
    </Page>
  );
}

export function KeybindsTab() {
  const { t: msg } = useI18n();
  return (
    <Page title={msg("settings.keybinds")} sub={msg("settings.usertabs.shortcuts.are.saved.on.this.device.only.global.shortcuts")}>
      <KeybindsEditor />
    </Page>
  );
}

const ACCENTS: { id: AccentId; label: string; hue: number; chroma: number }[] = [
  { id: 'iris', label: 'Iris', hue: 275, chroma: 0.2 }, { id: 'aurora', label: 'Aurora', hue: 175, chroma: 0.14 }, { id: 'ember', label: 'Ember', hue: 45, chroma: 0.17 },
  { id: 'rose', label: 'Rose', hue: 5, chroma: 0.2 }, { id: 'citrine', label: 'Citrine', hue: 100, chroma: 0.16 }, { id: 'sky', label: 'Sky', hue: 235, chroma: 0.16 },
];

export function AppearanceTab() {
  const { t: msg, number } = useI18n();
  const prefs = usePrefsStore();
  const themes: { id: ThemeId; label: string }[] = [{ id: 'dark', label: msg("settings.usertabs.dark") }, { id: 'oled', label: 'OLED' }, { id: 'light', label: msg("settings.usertabs.light") }];
  return (
    <Page title={msg("settings.appearance")}>
      <h3>{msg("settings.usertabs.theme")}</h3>
      <div className="theme-cards" role="radiogroup" aria-label={msg("settings.usertabs.theme")}>
        {themes.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={prefs.theme === t.id} className={`theme-card${prefs.theme === t.id ? ' is-on' : ''}`} data-theme={t.id} onClick={() => prefs.set('theme', t.id)}>
            <span className="theme-preview"><i /><i /><i /></span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <h3>{msg("settings.usertabs.accent")}</h3>
      <div className="accent-row" role="radiogroup" aria-label={msg("settings.usertabs.accent.colour")}>
        {ACCENTS.map((a) => (
          <button key={a.id} type="button" role="radio" aria-checked={prefs.accent === a.id} aria-label={a.label} title={a.label} className={`accent-dot${prefs.accent === a.id ? ' is-on' : ''}`} style={{ background: `oklch(0.7 ${a.chroma} ${a.hue})` }} onClick={() => prefs.set('accent', a.id)}>
            {prefs.accent === a.id && <Check size={14} weight="bold" />}
          </button>
        ))}
      </div>
      <SettingRow title={msg("settings.usertabs.sync.with.computer")} searchKey="Sync with computer" description={msg("settings.usertabs.follow.the.light.or.dark.setting.of.your.operating")}><Switch label={msg("settings.usertabs.sync.theme.with.computer")} checked={prefs.syncOsTheme} onChange={(v) => prefs.set('syncOsTheme', v)} /></SettingRow>
      <SettingRow title={msg("settings.usertabs.message.density")} searchKey="Message density" description={msg("settings.usertabs.compact.fits.more.messages.on.screen")}><Segmented label={msg("settings.usertabs.message.density")} value={prefs.density} onChange={(v) => prefs.set('density', v)} options={[{ value: 'cozy', label: msg("settings.usertabs.cozy") }, { value: 'compact', label: msg("settings.usertabs.compact") }]} /></SettingRow>
      {prefs.density === 'compact' && <SettingRow title={msg("settings.usertabs.show.avatars.in.compact")} searchKey="Show avatars in compact" description={msg("settings.usertabs.keep.avatars.next.to.message.groups.in.compact.mode")}><Switch label={msg("settings.usertabs.show.avatars.in.compact")} checked={prefs.showAvatarsInCompact} onChange={(v) => prefs.set('showAvatarsInCompact', v)} /></SettingRow>}
      <SettingRow title={msg("settings.usertabs.space.between.message.groups")} searchKey="Space between message groups" description={msg("settings.usertabs.pixels.between.messages.from.different.people.follows.your.account")}><Slider label={msg("settings.usertabs.space.between.message.groups")} value={prefs.messageSpacing} min={0} max={32} step={4} onChange={(v) => prefs.set('messageSpacing', v)} format={(v) => `${number(v)}px`} /></SettingRow>
      <SettingRow title={msg("settings.usertabs.channel.list.density")} searchKey="Channel list density" description={msg("settings.usertabs.row.height.in.the.channel.and.direct.message.lists")}><Segmented label={msg("settings.usertabs.channel.list.density")} value={prefs.channelListDensity} onChange={(v) => prefs.set('channelListDensity', v)} options={[{ value: 'cozy', label: msg("settings.usertabs.cozy") }, { value: 'compact', label: msg("settings.usertabs.compact") }]} /></SettingRow>
      <SettingRow title={msg("settings.usertabs.text.size")} searchKey="Text size"><Slider label={msg("settings.usertabs.text.size")} value={prefs.fontScale} min={0.85} max={1.3} step={0.05} onChange={(v) => prefs.set('fontScale', v)} format={(v) => number(v, { style: 'percent', maximumFractionDigits: 0 })} /></SettingRow>
      <SettingRow title={msg("settings.usertabs.zoom")} searchKey="Zoom" description={msg("settings.usertabs.scales.the.whole.window.ctrl.and.plus.or.minus")}>
        <div className="setting-inline">
          <Slider label={msg("settings.usertabs.zoom")} value={prefs.zoom} min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP} onChange={(v) => prefs.set('zoom', clampZoom(v))} format={(v) => number(v, { style: 'percent', maximumFractionDigits: 0 })} />
          <Button variant="ghost" disabled={prefs.zoom === 1} onClick={() => prefs.set('zoom', 1)}>{msg("common.reset")}</Button>
        </div>
      </SettingRow>
    </Page>
  );
}

export function AccessibilityTab() {
  const { t: msg, number } = useI18n();
  const prefs = usePrefsStore();
  const test = () => speak(msg("settings.usertabs.this.is.how.text.to.speech.sounds.at.this"), prefs.ttsRate);
  return (
    <Page title={msg("settings.accessibility")} sub={msg("settings.usertabs.applies.at.once.and.except.where.noted.follows.your")}>
      <h3>{msg("settings.usertabs.motion")}</h3>
      <SettingRow title={msg("settings.usertabs.sync.with.computer")} searchKey="Sync with computer" description={msg("settings.usertabs.reduce.motion.whenever.your.operating.system.asks.for.it")}><Switch label={msg("settings.usertabs.sync.reduced.motion.with.computer")} checked={prefs.syncOsMotion} onChange={(v) => prefs.set('syncOsMotion', v)} /></SettingRow>
      <SettingRow title={msg("settings.usertabs.reduce.motion")} searchKey="Reduce motion" description={msg("settings.usertabs.replaces.springs.with.instant.changes.and.keeps.the.speaking")}><Switch label={msg("settings.usertabs.reduce.motion")} checked={prefs.reduceMotion} onChange={(v) => prefs.set('reduceMotion', v)} /></SettingRow>
      <SettingRow title={msg("settings.usertabs.play.gifs.automatically")} searchKey="Play GIFs automatically" description={msg("settings.usertabs.when.off.gifs.show.their.first.frame.and.play")}><Switch label={msg("settings.usertabs.play.gifs.automatically")} checked={prefs.animateGifs} onChange={(v) => prefs.set('animateGifs', v)} /></SettingRow>
      <SettingRow title={msg("settings.usertabs.animate.emoji")} searchKey="Animate emoji" description={msg("settings.usertabs.custom.emoji.that.move")}><Switch label={msg("settings.usertabs.animate.emoji")} checked={prefs.animateEmoji} onChange={(v) => prefs.set('animateEmoji', v)} /></SettingRow>
      <SettingRow title={msg("settings.usertabs.animate.stickers")} searchKey="Animate stickers" description={msg("settings.usertabs.stickers.that.move")}><Switch label={msg("settings.usertabs.animate.stickers")} checked={prefs.animateStickers} onChange={(v) => prefs.set('animateStickers', v)} /></SettingRow>
      <h3>{msg("settings.usertabs.colour.and.contrast")}</h3>
      <SettingRow title={msg("settings.usertabs.saturation")} searchKey="Saturation" description={msg("settings.usertabs.lower.it.to.mute.every.colour.in.the.app")}><Slider label={msg("settings.usertabs.saturation")} value={prefs.saturation} min={0} max={1} step={0.05} onChange={(v) => prefs.set('saturation', v)} format={(v) => number(v, { style: 'percent', maximumFractionDigits: 0 })} /></SettingRow>
      <SettingRow title={msg("settings.usertabs.role.colours")} searchKey="Role colours" description={msg("settings.usertabs.how.the.top.role.colour.of.a.member.shows")}><Segmented label={msg("settings.usertabs.role.colours")} value={prefs.roleColors} onChange={(v) => prefs.set('roleColors', v)} options={[{ value: 'name', label: msg("settings.usertabs.in.the.name") }, { value: 'dot', label: msg("settings.usertabs.as.a.dot") }, { value: 'hidden', label: msg("settings.usertabs.hidden") }]} /></SettingRow>
      <SettingRow title={msg("settings.usertabs.high.contrast")} searchKey="High contrast" description={msg("settings.usertabs.stronger.text.and.visible.edges.on.buttons.and.fields")}><Switch label={msg("settings.usertabs.high.contrast")} checked={prefs.highContrast} onChange={(v) => prefs.set('highContrast', v)} /></SettingRow>
      <SettingRow title={msg("settings.usertabs.always.underline.links")} searchKey="Always underline links"><Switch label={msg("settings.usertabs.always.underline.links")} checked={prefs.linkUnderline} onChange={(v) => prefs.set('linkUnderline', v)} /></SettingRow>
      <h3>{msg("settings.usertabs.text.to.speech")}</h3>
      <SettingRow title={msg("settings.usertabs.allow.playback.and.use.of.tts")} searchKey="Allow playback and use of /tts" description={msg("settings.usertabs.type.tts.and.a.message.to.have.it.read")}><Switch label={msg("settings.usertabs.allow.text.to.speech")} checked={prefs.ttsReadAloud} onChange={(v) => prefs.set('ttsReadAloud', v)} /></SettingRow>
      <SettingRow title={msg("settings.usertabs.speech.rate")} searchKey="Speech rate">
        <div className="setting-inline">
          <Slider label={msg("settings.usertabs.speech.rate")} value={prefs.ttsRate} min={0.5} max={2} step={0.25} onChange={(v) => prefs.set('ttsRate', v)} format={(v) => `${number(v)}x`} />
          <Button variant="secondary" onClick={test}>{msg("settings.usertabs.test")}</Button>
        </div>
      </SettingRow>
      <h3>{msg("settings.usertabs.keyboard")}</h3>
      <p className="setting-desc">{msg("settings.usertabs.every.list.and.menu.moves.with.the.arrow.keys")}</p>
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
  const { t: msg, catalogText, number } = useI18n();
  const prefs = usePrefsStore();
  return (
    <Page title={msg("settings.notifications")}>
      <SettingRow title={msg("settings.usertabs.desktop.notifications")} searchKey="Desktop notifications" description={msg("settings.usertabs.shown.for.mentions.and.direct.messages")}><Switch label={msg("settings.usertabs.desktop.notifications")} checked={prefs.notifyDesktop} onChange={(v) => prefs.set('notifyDesktop', v)} /></SettingRow>
      <SettingRow title={msg("settings.usertabs.only.mentions")} searchKey="Only mentions"><Switch label={msg("settings.usertabs.only.mentions")} checked={prefs.notifyOnlyMentions} onChange={(v) => prefs.set('notifyOnlyMentions', v)} /></SettingRow>
      <SettingRow title={msg("settings.usertabs.notification.sounds")} searchKey="Notification sounds" description={msg("settings.usertabs.master.switch.for.call.sounds.ringtone.and.message.sounds")}><Switch label={msg("settings.usertabs.notification.sounds")} checked={prefs.notifySounds} onChange={(v) => prefs.set('notifySounds', v)} /></SettingRow>
      {SOUND_OPTIONS.map((o) => (
        <SettingRow key={o.id} title={msg('settings.sound', { name: catalogText(o.label) })}>
          <div className="setting-inline">
            <Button variant="secondary" onClick={() => soundEffects.play(o.id, prefs.outputVolume, prefs.outputDeviceId)}>{msg("settings.usertabs.preview")}</Button>
            <Switch label={msg('settings.sound', { name: catalogText(o.label) })} checked={prefs.notifySounds && prefs.soundToggles[o.id] !== false} onChange={(v) => prefs.set('soundToggles', { ...prefs.soundToggles, [o.id]: v })} />
          </div>
        </SettingRow>
      ))}
      <Field label={msg("settings.usertabs.ringtone")}>
        {(id) => (
          <div className="setting-inline">
            <Select id={id} value={prefs.ringtone} onChange={(e) => prefs.set('ringtone', e.target.value as RingtoneId)}>
              {RINGTONE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{msg(`ringtone.${o.id}`)}</option>)}
            </Select>
            <Button variant="secondary" onClick={() => previewRingtone(prefs.ringtone, prefs.ringtoneVolume, prefs.outputDeviceId)}>{msg("settings.usertabs.preview")}</Button>
          </div>
        )}
      </Field>
      <Field label={msg("settings.usertabs.ringtone.volume")}>{() => <Slider label={msg("settings.usertabs.ringtone.volume")} value={prefs.ringtoneVolume} min={0} max={1} step={0.05} onChange={(v) => prefs.set('ringtoneVolume', v)} format={(v) => number(v, { style: 'percent', maximumFractionDigits: 0 })} />}</Field>
      <SettingRow title={msg("settings.usertabs.flash.taskbar")} searchKey="Flash taskbar"><Switch label={msg("settings.usertabs.flash.taskbar")} checked={prefs.flashTaskbar} onChange={(v) => prefs.set('flashTaskbar', v)} /></SettingRow>
      <p className="setting-desc">{msg("settings.usertabs.notifications.for.encrypted.chats.show.only.the.sender.s")}</p>
    </Page>
  );
}

export function ConnectionTab() {
  const { t: msg } = useI18n();
  const info = useSessionStore((s) => s.appInfo);
  const [open, setOpen] = useState(false);
  if (!info) return null;
  return (
    <Page title={msg("settings.connection")} sub={msg("settings.usertabs.where.this.app.connects")}>
      {(['apiUrl', 'gatewayUrl', 'cdnUrl'] as const).map((k) => <SettingRow key={k} title={k === 'apiUrl' ? 'API' : k === 'gatewayUrl' ? 'Gateway' : 'CDN'}><code className="mono">{info.connection[k]}</code></SettingRow>)}
      <SettingRow title={msg("settings.profile")} searchKey="Profile" description={msg("settings.usertabs.environment.variables.discordy.profile.discordy.api.url.discordy.gateway")}><Button onClick={() => setOpen(true)}>{msg('settings.connectionChange', { name: info.connection.id })}</Button></SettingRow>
      <ConnectionPicker open={open} onClose={() => setOpen(false)} />
    </Page>
  );
}

export function AboutTab() {
  const { t: msg, number } = useI18n();
  const info = useSessionStore((s) => s.appInfo);
  const status = useUpdateStore((s) => s.status);
  const label = status.state === 'checking' ? msg("settings.usertabs.checking.for.updates") : status.state === 'available' ? msg('settings.versionAvailable', { version: status.version }) : status.state === 'downloading' ? msg('settings.downloading', { percent: number(status.percent / 100, { style: 'percent', maximumFractionDigits: 0 }) }) : status.state === 'downloaded' ? msg('settings.versionReady', { version: status.version }) : status.state === 'not-available' ? msg("settings.usertabs.you.are.up.to.date") : status.state === 'error' ? msg('settings.updateFailed', { message: status.message }) : null;
  return (
    <Page title={msg("settings.about")}>
      <SettingRow title={msg("settings.usertabs.version")} searchKey="Version"><span className="mono">{info?.version}</span></SettingRow>
      <SettingRow title={msg("settings.usertabs.platform")} searchKey="Platform"><span className="mono">{info?.platform}</span></SettingRow>
      <SettingRow title={msg("settings.usertabs.update.feed")} searchKey="Update feed"><span className="mono">{info?.updateFeedUrl || msg("settings.usertabs.none")}</span></SettingRow>
      <div className="row-start">
        {status.state === 'downloaded' ? <Button variant="primary" onClick={() => bridge?.updates.install()}>{msg("settings.usertabs.restart.and.install")}</Button> : <Button disabled={!bridge || status.state === 'checking'} onClick={() => void bridge?.updates.check()}>{msg("settings.usertabs.check.for.updates")}</Button>}
        {label && <span role="status" className="setting-desc">{label}</span>}
      </div>
    </Page>
  );
}

export function DesktopTab() {
  const { t: msg } = useI18n();
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [restart, setRestart] = useState(false);
  useEffect(() => {
    void bridge?.desktop.get().then(setSettings);
  }, []);
  if (!bridge) return <Page title={msg("settings.desktop")} sub={msg("settings.usertabs.these.options.are.available.in.the.desktop.app")}><p className="setting-desc">{msg("settings.usertabs.open.this.page.in.the.installed.app.to.change")}</p></Page>;
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
    <Page title={msg("settings.desktop")} sub={msg("settings.usertabs.saved.on.this.device.only.they.do.not.follow")}>
      {row('openAtLogin', msg('settings.openApp', { app: BRAND.displayName }), msg("settings.usertabs.start.the.app.when.you.sign.in.to.your"))}
      {row('showTray', msg("settings.usertabs.show.in.system.tray"), msg("settings.usertabs.keep.an.icon.in.the.system.tray.with.a"))}
      {row('startMinimized', msg("settings.usertabs.start.minimized"), msg("settings.usertabs.when.started.at.login.stay.in.the.tray.instead"), !settings?.openAtLogin || !settings.showTray)}
      {row('minimizeToTray', msg("settings.usertabs.minimize.to.tray"), msg("settings.usertabs.the.minimize.button.hides.the.window.to.the.tray"), !settings?.showTray)}
      {row('closeToTray', msg("settings.usertabs.close.button.minimizes.to.tray"), msg("settings.usertabs.the.close.button.hides.the.window.to.the.tray"), !settings?.showTray)}
      {row('hardwareAcceleration', msg("settings.usertabs.hardware.acceleration"), msg("settings.usertabs.use.the.gpu.for.rendering.turn.off.if.you"))}
      <SettingRow title={msg("settings.usertabs.go.idle.automatically")} searchKey="Go idle automatically" description={msg("settings.usertabs.show.as.idle.after.this.long.without.keyboard.or")}>
        <Select aria-label={msg("settings.usertabs.idle.timeout")} value={String(settings?.idleTimeoutMinutes ?? 10)} disabled={!settings} onChange={(e) => change({ idleTimeoutMinutes: Number(e.target.value) })}>
          {IDLE_TIMEOUT_CHOICES.map((m) => <option key={m} value={m}>{m === 0 ? msg("settings.usertabs.never") : m === 60 ? msg("settings.usertabs.1.hour") : msg('settings.minutes', { count: m })}</option>)}
        </Select>
      </SettingRow>
      {restart && (
        <div className="row-start">
          <span role="status" className="setting-desc">{msg("settings.usertabs.restart.to.apply.hardware.acceleration")}</span>
          <Button variant="primary" onClick={() => bridge?.desktop.relaunch()}>{msg("settings.usertabs.restart.now")}</Button>
        </div>
      )}
    </Page>
  );
}

export function ChatTab() {
  const { t: msg } = useI18n();
  const prefs = usePrefsStore();
  return (
    <Page title={msg("settings.chat")} sub={msg("settings.usertabs.how.messages.look.and.how.you.send.them.these")}>
      <h3>{msg("settings.usertabs.display")}</h3>
      <SettingRow title={msg("settings.usertabs.display.images.and.videos")} searchKey="Display images and videos" description={msg("settings.usertabs.show.attachments.inside.the.message.instead.of.as.links")}><Switch label={msg("settings.usertabs.display.images.and.videos")} checked={prefs.inlineMedia} onChange={(v) => prefs.set('inlineMedia', v)} /></SettingRow>
      <SettingRow title={msg("settings.usertabs.show.embeds")} searchKey="Show embeds" description={msg("settings.usertabs.rich.cards.that.servers.attach.to.links.such.as")}><Switch label={msg("settings.usertabs.show.embeds")} checked={prefs.inlineEmbeds} onChange={(v) => prefs.set('inlineEmbeds', v)} /></SettingRow>
      <SettingRow title={msg("settings.usertabs.show.link.previews")} searchKey="Show link previews" description={msg("settings.usertabs.previews.of.links.in.messages.made.by.the.server")}><Switch label={msg("settings.usertabs.show.link.previews")} checked={prefs.linkPreviews} onChange={(v) => prefs.set('linkPreviews', v)} /></SettingRow>
      <SettingRow title={msg("settings.usertabs.show.spoiler.content")} searchKey="Show spoiler content" description={msg("settings.usertabs.when.hidden.text.is.revealed.without.a.click")}>
        <Segmented label={msg("settings.usertabs.show.spoiler.content")} value={prefs.spoilerDisplay} onChange={(v) => prefs.set('spoilerDisplay', v)} options={[{ value: 'click', label: msg("settings.usertabs.on.click") }, { value: 'moderated', label: msg("settings.usertabs.on.servers.i.moderate") }, { value: 'always', label: msg("settings.usertabs.always") }]} />
      </SettingRow>
      <SettingRow title={msg("settings.usertabs.show.reactions")} searchKey="Show reactions" description={msg("settings.usertabs.reaction.chips.under.messages")}><Switch label={msg("settings.usertabs.show.reactions")} checked={prefs.showReactions} onChange={(v) => prefs.set('showReactions', v)} /></SettingRow>
      <SettingRow title={msg("settings.usertabs.compact.reply.preview")} searchKey="Compact reply preview" description={msg("settings.usertabs.quote.the.replied.to.message.on.a.single.line")}><Switch label={msg("settings.usertabs.compact.reply.preview")} checked={prefs.compactReplyPreview} onChange={(v) => prefs.set('compactReplyPreview', v)} /></SettingRow>
      <h3>{msg("settings.usertabs.composer")}</h3>
      <SettingRow title={msg("settings.usertabs.convert.emoticons")} searchKey="Convert emoticons" description={msg("settings.usertabs.turn.and.similar.into.emoji.as.you.send")}><Switch label={msg("settings.usertabs.convert.emoticons")} checked={prefs.convertEmoticons} onChange={(v) => prefs.set('convertEmoticons', v)} /></SettingRow>
      <SettingRow title={msg("settings.usertabs.send.with.ctrl.enter")} searchKey="Send with Ctrl+Enter" description={msg("settings.usertabs.enter.adds.a.new.line.and.ctrl.enter.sends")}><Switch label={msg("settings.usertabs.send.with.ctrl.enter")} checked={prefs.sendWithCtrlEnter} onChange={(v) => prefs.set('sendWithCtrlEnter', v)} /></SettingRow>
    </Page>
  );
}

export function AdvancedTab() {
  const { t: msg } = useI18n();
  const prefs = usePrefsStore();
  return (
    <Page title={msg("settings.advanced")}>
      <SettingRow title={msg("settings.usertabs.developer.mode")} searchKey="Developer mode" description={msg("settings.usertabs.adds.copy.id.to.the.menus.of.channels.categories")}>
        <Switch label={msg("settings.usertabs.developer.mode")} checked={prefs.developerMode} onChange={(v) => prefs.set('developerMode', v)} />
      </SettingRow>
    </Page>
  );
}
