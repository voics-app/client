import { getI18n, useI18n } from '../../shared/i18n';
import type { I18n } from '@discordy/core/domain/i18n';
import { CaretUp, Waveform } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { activeChoiceId, deviceChoices, keysFor, percent, type DeviceChoice } from '@discordy/core/domain/voicePanel';
import { IconButton } from '../../shared/ui/IconButton';
import { Slider } from '../../shared/ui/Form';
import { Menu, type MenuEntry } from '../../shared/ui/Menu';

export type DeviceKind = 'input' | 'output' | 'camera';

const KIND: Record<DeviceKind, { media: MediaDeviceKind; noun: string; heading: string }> = {
  input: { media: 'audioinput', noun: 'Microphone', heading: 'Input device' },
  output: { media: 'audiooutput', noun: 'Speaker', heading: 'Output device' },
  camera: { media: 'videoinput', noun: 'Camera', heading: 'Camera' },
};

/** Live list of media devices; refreshed when hardware is plugged in or removed. */
export function useMediaDevices(): MediaDeviceInfo[] {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.enumerateDevices) return;
    let alive = true;
    const load = () => void md.enumerateDevices().then((d) => alive && setDevices(d)).catch(() => alive && setDevices([]));
    load();
    md.addEventListener?.('devicechange', load);
    return () => {
      alive = false;
      md.removeEventListener?.('devicechange', load);
    };
  }, []);
  return devices;
}

export interface DeviceMenuSpec {
  kind: DeviceKind;
  choices: DeviceChoice[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Volume slider (inputs and outputs only). */
  volume?: { value: number; onChange: (v: number) => void };
  onOpenVoiceSettings: () => void;
}

/** Menu entries of a device quick menu: devices (checked = active), optional volume slider, and a link to the full settings. */
export function deviceMenuEntries(spec: DeviceMenuSpec, intl: I18n = getI18n()): MenuEntry[] {
  const info = KIND[spec.kind];
  const active = activeChoiceId(spec.choices, spec.selected);
  const entries: MenuEntry[] = [
    { kind: 'label', label: intl.catalogText(info.heading) },
    ...spec.choices.map<MenuEntry>((c) => ({ kind: 'item', label: c.label, checked: c.id === active, onSelect: () => spec.onSelect(c.id || null) })),
  ];
  if (spec.volume) {
    const { value, onChange } = spec.volume;
    entries.push(
      { kind: 'separator' },
      { kind: 'label', label: intl.catalogText(spec.kind === 'input' ? 'Input volume' : 'Output volume') },
      { kind: 'content', node: <Slider label={intl.catalogText(spec.kind === 'input' ? 'Input volume' : 'Output volume')} value={value} min={0} max={2} step={0.05} onChange={onChange} format={(v) => percent(v, intl.locale)} /> },
    );
  }
  entries.push({ kind: 'separator' }, { kind: 'item', label: intl.catalogText(spec.kind === 'camera' ? 'Test camera' : 'Voice settings'), onSelect: spec.onOpenVoiceSettings });
  return entries;
}

const MENU_WIDTH = 248;

/** Small caret next to a mute, deafen or camera button; opens the device and volume quick menu above it. */
export function DeviceArrow({ kind, size = 'sm' }: { kind: DeviceKind; size?: 'sm' | 'md' }) {
  const intl = useI18n();
  const devices = useMediaDevices();
  const prefs = usePrefsStore();
  const openSettings = useUiStore((s) => s.openSettings);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const info = KIND[kind];
  const choices = deviceChoices(devices, info.media, info.noun, intl.locale);
  const selected = kind === 'input' ? prefs.inputDeviceId : kind === 'output' ? prefs.outputDeviceId : prefs.cameraDeviceId;
  const key = kind === 'input' ? 'inputDeviceId' : kind === 'output' ? 'outputDeviceId' : 'cameraDeviceId';
  const entries = deviceMenuEntries({
    kind,
    choices,
    selected,
    onSelect: (id) => prefs.set(key, id),
    volume: kind === 'camera' ? undefined : { value: kind === 'input' ? prefs.inputVolume : prefs.outputVolume, onChange: (v) => prefs.set(kind === 'input' ? 'inputVolume' : 'outputVolume', v) },
    onOpenVoiceSettings: () => openSettings({ kind: 'user', tab: 'voice' }),
  }, intl);
  return (
    <>
      <IconButton
        label={intl.t('voice.options', { device: intl.catalogText(info.heading) })}
        size={size}
        className="device-arrow"
        aria-haspopup="menu"
        aria-expanded={pos !== null}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPos(pos ? null : { x: r.left + r.width / 2 - MENU_WIDTH / 2, y: r.top - entries.length * 34 - 24 });
        }}
      >
        <CaretUp size={12} weight="bold" />
      </IconButton>
      <Menu open={pos !== null} x={pos?.x ?? 0} y={pos?.y ?? 0} entries={entries} onClose={() => setPos(null)} minWidth={MENU_WIDTH} />
    </>
  );
}

/** Quick toggle for the RNNoise noise suppression setting. */
export function NoiseSuppressionButton({ size = 'md', iconSize = 20 }: { size?: 'md' | 'lg'; iconSize?: number }) {
  const { t: msg } = useI18n();
  const on = usePrefsStore((s) => s.noiseSuppression);
  const set = usePrefsStore((s) => s.set);
  return (
    <IconButton label={msg('voice.suppression', { state: on ? 'on' : 'off' })} size={size} active={on} tone={on ? 'accent' : 'default'} onClick={() => set('noiseSuppression', !on)}>
      <Waveform size={iconSize} weight={on ? 'fill' : 'regular'} />
    </IconButton>
  );
}

/** Tooltip text for a keybound voice action, read from the live keybind prefs. */
export function useKeyHint(action: Parameters<typeof keysFor>[1]): string {
  return usePrefsStore((s) => keysFor(s.keybinds, action));
}
