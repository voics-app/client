/** Pure helpers for the user area and voice connection panel: connection details, device choices and keybind-aware tooltip hints. */
import type { Keybind, KeybindAction } from './keybinds';

export const RTT_HISTORY_LIMIT = 60;

export type QualityTone = 'good' | 'fair' | 'poor';

export function qualityTone(rttMs: number, lossPct: number): QualityTone {
  if (rttMs > 250 || lossPct > 8) return 'poor';
  if (rttMs > 120 || lossPct > 3) return 'fair';
  return 'good';
}

/** Appends a round-trip sample, keeping only the most recent ones; non-finite samples are ignored. */
export function appendRtt(history: readonly number[], rttMs: number): number[] {
  if (!Number.isFinite(rttMs)) return [...history];
  return [...history, rttMs].slice(-RTT_HISTORY_LIMIT);
}

export function averageRtt(history: readonly number[]): number | null {
  if (history.length === 0) return null;
  return history.reduce((a, b) => a + b, 0) / history.length;
}

export const formatMs = (ms: number | null): string => (ms === null ? '-' : `${Math.round(ms)} ms`);
export const formatLoss = (pct: number): string => `${pct.toFixed(1)}%`;

export interface ConnectionRow {
  label: string;
  value: string;
  tone?: QualityTone;
}

export interface ConnectionInput {
  quality: { rttMs: number; lossPct: number; jitterMs: number; bitrateKbps: number } | null;
  history: readonly number[];
  region: string | null;
  e2ee: boolean;
}

/** Rows for the Connection details popover (average and last ping, outbound loss, region, encryption, transport). */
export function connectionRows(input: ConnectionInput): ConnectionRow[] {
  const q = input.quality;
  const rows: ConnectionRow[] = [
    { label: 'Average ping', value: formatMs(averageRtt(input.history)) },
    { label: 'Last ping', value: formatMs(q ? q.rttMs : null), tone: q ? qualityTone(q.rttMs, 0) : undefined },
    { label: 'Outbound packet loss', value: q ? formatLoss(q.lossPct) : '-', tone: q ? qualityTone(0, q.lossPct) : undefined },
  ];
  if (q) {
    rows.push({ label: 'Jitter', value: formatMs(q.jitterMs) });
    rows.push({ label: 'Bitrate', value: `${Math.round(q.bitrateKbps)} kbps` });
  }
  rows.push({ label: 'Region', value: input.region ?? '-' });
  rows.push({ label: 'Encryption', value: input.e2ee ? 'End-to-end (MLS)' : 'Transport only' });
  rows.push({ label: 'Transport', value: 'DTLS-SRTP over WebRTC' });
  return rows;
}

export interface DeviceChoice {
  id: string;
  label: string;
}

/** Device options for a quick menu: the system default first, then every device of `kind` with a readable name. */
export function deviceChoices(devices: readonly Pick<MediaDeviceInfo, 'deviceId' | 'kind' | 'label'>[], kind: MediaDeviceKind, noun: string): DeviceChoice[] {
  const list = devices.filter((d) => d.kind === kind && d.deviceId !== 'default' && d.deviceId !== 'communications');
  return [{ id: '', label: 'System default' }, ...list.map((d, i) => ({ id: d.deviceId, label: d.label || `${noun} ${i + 1}` }))];
}

/** Whether `selected` is the active choice; a stored device that is no longer plugged in falls back to the default. */
export function activeChoiceId(choices: readonly DeviceChoice[], selected: string | null): string {
  return selected && choices.some((c) => c.id === selected) ? selected : '';
}

export function keysFor(binds: readonly Keybind[], action: KeybindAction): string {
  return binds.find((b) => b.action === action)?.keys ?? '';
}

export const percent = (v: number): string => `${Math.round(v * 100)}%`;
