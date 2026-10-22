/** Device-local preferences (appearance, voice, keybinds, notifications), persisted to localStorage. */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { SoundId } from '@renderer/domain/sounds';
import { DEFAULT_RINGTONE, DEFAULT_RINGTONE_VOLUME, type RingtoneId } from '@renderer/domain/ringtones';
import type { VideoPresetId } from '@renderer/domain/videoPresets';
import { DEFAULT_STAGE_LAYOUT, normalizeLayout, type StageLayoutPrefs } from '@renderer/domain/stageLayout';
import { recordReaction, type QuickEmoji } from '@renderer/domain/quickReactions';

export type ThemeId = 'dark' | 'oled' | 'light';
export type AccentId = 'iris' | 'aurora' | 'ember' | 'rose' | 'citrine' | 'sky';
export type Density = 'cozy' | 'compact';
export type InputMode = 'vad' | 'ptt';
/** Device-local notification level for a channel or category until server-side settings exist (api#28). */
export type NotifyLevel = 'all' | 'mentions' | 'none';

export interface Keybind {
  id: string;
  action: 'palette' | 'toggleMute' | 'toggleDeafen' | 'markRead' | 'search' | 'upload' | 'prevChannel' | 'nextChannel';
  keys: string;
}

export interface PrefsState {
  theme: ThemeId;
  accent: AccentId;
  reduceMotion: boolean;
  density: Density;
  fontScale: number;
  showAvatarsInCompact: boolean;
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  cameraDeviceId: string | null;
  cameraPreset: VideoPresetId;
  inputVolume: number;
  outputVolume: number;
  inputMode: InputMode;
  vadThreshold: number;
  pttKeycode: number | null;
  pttLabel: string | null;
  pttReleaseDelayMs: number;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGain: boolean;
  notifyDesktop: boolean;
  notifyOnlyMentions: boolean;
  notifySounds: boolean;
  /** Per-sound switches under the master `notifySounds`; a missing entry means on. */
  soundToggles: Partial<Record<SoundId, boolean>>;
  ringtone: RingtoneId;
  ringtoneVolume: number;
  flashTaskbar: boolean;
  recentReactions: QuickEmoji[];
  /** Skin tone modifier applied to the emoji picker's hand emoji; empty for the default. */
  skinTone: string;
  collapsedCategories: Record<string, boolean>;
  /** Call stage layout (grid/focus/spotlight, pin, hide non-video) remembered per voice channel. */
  stageLayouts: Record<string, StageLayoutPrefs>;
  keybinds: Keybind[];
  /** Show previews of links in messages (Standard chats). */
  linkPreviews: boolean;
  /** Playback volume of the audio and video players, remembered across messages. */
  mediaVolume: number;
  mediaMuted: boolean;
  set<K extends keyof PrefsData>(key: K, value: PrefsData[K]): void;
  patch(values: Partial<PrefsData>): void;
  toggleMap(key: 'collapsedCategories', id: string): void;
  patchStageLayout(channelId: string, patch: Partial<StageLayoutPrefs>): void;
  setCollapsed(ids: string[], collapsed: boolean): void;
  recordReaction(emoji: QuickEmoji): void;
}

export type PrefsData = Omit<PrefsState, 'set' | 'patch' | 'toggleMap' | 'patchStageLayout' | 'setCollapsed' | 'recordReaction'>;

export const DEFAULT_KEYBINDS: Keybind[] = [
  { id: 'palette', action: 'palette', keys: 'Ctrl+K' },
  { id: 'mute', action: 'toggleMute', keys: 'Ctrl+Shift+M' },
  { id: 'deafen', action: 'toggleDeafen', keys: 'Ctrl+Shift+D' },
  { id: 'read', action: 'markRead', keys: 'Escape' },
  { id: 'search', action: 'search', keys: 'Ctrl+F' },
  { id: 'upload', action: 'upload', keys: 'Ctrl+Shift+U' },
  { id: 'prev', action: 'prevChannel', keys: 'Alt+ArrowUp' },
  { id: 'next', action: 'nextChannel', keys: 'Alt+ArrowDown' },
];

export const DEFAULT_PREFS: PrefsData = {
  theme: 'dark',
  accent: 'iris',
  reduceMotion: false,
  density: 'cozy',
  fontScale: 1,
  showAvatarsInCompact: false,
  inputDeviceId: null,
  outputDeviceId: null,
  cameraDeviceId: null,
  cameraPreset: '720p30',
  inputVolume: 1,
  outputVolume: 1,
  inputMode: 'vad',
  vadThreshold: 0.12,
  pttKeycode: null,
  pttLabel: null,
  pttReleaseDelayMs: 200,
  noiseSuppression: true,
  echoCancellation: true,
  autoGain: true,
  notifyDesktop: true,
  notifyOnlyMentions: false,
  notifySounds: true,
  soundToggles: {},
  ringtone: DEFAULT_RINGTONE,
  ringtoneVolume: DEFAULT_RINGTONE_VOLUME,
  flashTaskbar: true,
  recentReactions: [],
  skinTone: '',
  collapsedCategories: {},
  stageLayouts: {},
  keybinds: DEFAULT_KEYBINDS,
  linkPreviews: true,
  mediaVolume: 1,
  mediaMuted: false,
};

function memoryStorage() {
  const memory = new Map<string, string>();
  return {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
    removeItem: (k: string) => void memory.delete(k),
  };
}

/** localStorage can be absent or throw (private windows, blocked storage); fall back to memory. */
function browserStorage() {
  try {
    const probe = '__discordy_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return memoryStorage();
  }
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFS,
      set: (key, value) => set({ [key]: value } as Partial<PrefsState>),
      patch: (values) => set(values),
      setCollapsed: (ids, collapsed) => set((s) => ({ collapsedCategories: { ...s.collapsedCategories, ...Object.fromEntries(ids.map((id) => [id, collapsed])) } })),
      recordReaction: (emoji) => set((s) => ({ recentReactions: recordReaction(s.recentReactions, emoji) })),
      patchStageLayout: (channelId, patch) => set((s) => ({ stageLayouts: { ...s.stageLayouts, [channelId]: normalizeLayout({ ...(s.stageLayouts[channelId] ?? DEFAULT_STAGE_LAYOUT), ...patch }) } })),
      toggleMap: (key, id) => set((s) => ({ [key]: { ...s[key], [id]: !s[key][id] } }) as Partial<PrefsState>),
    }),
    {
      name: 'discordy.prefs.v1',
      storage: createJSONStorage(() => (typeof window === 'undefined' ? memoryStorage() : browserStorage())),
    },
  ),
);
