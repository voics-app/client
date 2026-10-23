/**
 * Which preferences follow the account to every device (client#123) and how they map onto the
 * server's UserSettings document. Everything not listed stays device-local on purpose: audio and
 * video devices, volumes, voice processing, push-to-talk, keybinds, the desktop notification
 * toggle, taskbar flash, collapsed categories, call stage layouts and media player volume.
 */
import { RINGTONE_OPTIONS } from '@renderer/domain/ringtones';
import type { UserPreferences, UserSettings } from '@shared/contracts/rest';
import { DEFAULT_PREFS, type PrefsData } from './stores/prefsStore';

type Mapping =
  | { where: 'theme' }
  | { where: 'compact' }
  | { where: 'pref'; field: keyof UserPreferences };

export const SYNCED: { [K in keyof PrefsData]?: Mapping } = {
  theme: { where: 'theme' },
  density: { where: 'compact' },
  accent: { where: 'pref', field: 'accent' },
  reduceMotion: { where: 'pref', field: 'reduce_motion' },
  fontScale: { where: 'pref', field: 'font_scale' },
  showAvatarsInCompact: { where: 'pref', field: 'show_avatars_in_compact' },
  linkPreviews: { where: 'pref', field: 'link_previews' },
  messageSpacing: { where: 'pref', field: 'message_spacing' },
  saturation: { where: 'pref', field: 'saturation' },
  roleColors: { where: 'pref', field: 'role_colors' },
  linkUnderline: { where: 'pref', field: 'link_underline' },
  highContrast: { where: 'pref', field: 'high_contrast' },
  animateGifs: { where: 'pref', field: 'animate_gifs' },
  animateEmoji: { where: 'pref', field: 'animate_emoji' },
  animateStickers: { where: 'pref', field: 'animate_stickers' },
  ttsReadAloud: { where: 'pref', field: 'tts_read_aloud' },
  ttsRate: { where: 'pref', field: 'tts_rate' },
  notifyOnlyMentions: { where: 'pref', field: 'notify_only_mentions' },
  notifySounds: { where: 'pref', field: 'notify_sounds' },
  soundToggles: { where: 'pref', field: 'sound_toggles' },
  ringtone: { where: 'pref', field: 'ringtone' },
  skinTone: { where: 'pref', field: 'skin_tone' },
  recentReactions: { where: 'pref', field: 'recent_reactions' },
};

export type SyncedKey = keyof typeof SYNCED;
export const SYNCED_KEYS = Object.keys(SYNCED) as SyncedKey[];

export const sameValue = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);

const THEMES = ['dark', 'oled', 'light'];
const ACCENTS = ['iris', 'aurora', 'ember', 'rose', 'citrine', 'sky'];

/** Light type guard so a malformed server value can never corrupt the local store. */
function usable(key: SyncedKey, value: unknown): boolean {
  switch (key) {
    case 'theme': return typeof value === 'string' && THEMES.includes(value);
    case 'accent': return typeof value === 'string' && ACCENTS.includes(value);
    case 'density': return typeof value === 'boolean';
    case 'fontScale': return typeof value === 'number' && value >= 0.75 && value <= 1.5;
    case 'saturation': return typeof value === 'number' && value >= 0 && value <= 1;
    case 'ttsRate': return typeof value === 'number' && value >= 0.5 && value <= 2;
    case 'messageSpacing': return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 32;
    case 'roleColors': return value === 'name' || value === 'dot' || value === 'hidden';
    case 'soundToggles': return !!value && typeof value === 'object' && !Array.isArray(value);
    case 'recentReactions': return Array.isArray(value);
    case 'ringtone': return typeof value === 'string' && RINGTONE_OPTIONS.some((o) => o.id === value);
    case 'skinTone': return typeof value === 'string';
    default: return typeof value === 'boolean';
  }
}

/** Values the server holds, in client shape. A key is absent when the server has nothing for it
 * (`preferences` is sparse). `density` is derived from message_display_compact. */
export function fromServer(settings: Partial<UserSettings> | undefined): Partial<PrefsData> {
  const out: Record<string, unknown> = {};
  if (!settings) return out;
  const prefs = (settings.preferences ?? {}) as Record<string, unknown>;
  for (const key of SYNCED_KEYS) {
    const m = SYNCED[key]!;
    let raw: unknown;
    if (m.where === 'theme') raw = settings.theme;
    else if (m.where === 'compact') raw = settings.message_display_compact;
    else raw = prefs[m.field];
    if (raw === undefined || !usable(key, raw)) continue;
    out[key] = m.where === 'compact' ? ((raw as boolean) ? 'compact' : 'cozy') : raw;
  }
  return out as Partial<PrefsData>;
}

/** The PATCH body for the given keys at their values in `data`. */
export function toServerPatch(keys: readonly SyncedKey[], data: Pick<PrefsData, SyncedKey>): Partial<UserSettings> {
  const patch: Partial<UserSettings> = {};
  const preferences: Record<string, unknown> = {};
  for (const key of keys) {
    const m = SYNCED[key]!;
    if (m.where === 'theme') patch.theme = data.theme;
    else if (m.where === 'compact') patch.message_display_compact = data.density === 'compact';
    else preferences[m.field] = data[key];
  }
  if (Object.keys(preferences).length) patch.preferences = preferences as UserPreferences;
  return patch;
}

/** True when the server holds nothing the user chose for this key: it is absent, or (for the
 * fields the server always reports) still at its default. */
export function serverIsDefault(key: SyncedKey, server: Partial<PrefsData>): boolean {
  const value = server[key];
  return value === undefined || sameValue(value, DEFAULT_PREFS[key]);
}

export const syncedSlice = (data: PrefsData): Pick<PrefsData, SyncedKey> =>
  Object.fromEntries(SYNCED_KEYS.map((k) => [k, data[k]])) as Pick<PrefsData, SyncedKey>;
