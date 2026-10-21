/** Device-local preferences (appearance, voice, keybinds, notifications), persisted to localStorage. */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DEFAULT_RINGTONE, DEFAULT_RINGTONE_VOLUME, type RingtoneId } from '@renderer/domain/ringtones';
import type { VideoPresetId } from '@renderer/domain/videoPresets';
import { applyMute, applyUnmute } from '@renderer/domain/mute';
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
  ringtone: RingtoneId;
  ringtoneVolume: number;
  flashTaskbar: boolean;
  mutedChannels: Record<string, boolean>;
  /** Epoch ms at which a timed mute ends; absent means until turned back on. */
  muteUntil: Record<string, number>;
  notifyLevels: Record<string, NotifyLevel>;
  recentReactions: QuickEmoji[];
  collapsedCategories: Record<string, boolean>;
  keybinds: Keybind[];
  /** Show previews of links in messages (Standard chats). */
  linkPreviews: boolean;
  /** Playback volume of the audio and video players, remembered across messages. */
  mediaVolume: number;
  mediaMuted: boolean;
  set<K extends keyof PrefsData>(key: K, value: PrefsData[K]): void;
  patch(values: Partial<PrefsData>): void;
  toggleMap(key: 'mutedChannels' | 'collapsedCategories', id: string): void;
  muteFor(ids: string[], ms: number | null): void;
  unmute(ids: string[]): void;
  setCollapsed(ids: string[], collapsed: boolean): void;
  setNotifyLevel(id: string, level: NotifyLevel): void;
  recordReaction(emoji: QuickEmoji): void;
}

export type PrefsData = Omit<PrefsState, 'set' | 'patch' | 'toggleMap' | 'muteFor' | 'unmute' | 'setCollapsed' | 'setNotifyLevel' | 'recordReaction'>;

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
  ringtone: DEFAULT_RINGTONE,
  ringtoneVolume: DEFAULT_RINGTONE_VOLUME,
  flashTaskbar: true,
  mutedChannels: {},
  muteUntil: {},
  notifyLevels: {},
  recentReactions: [],
  collapsedCategories: {},
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
    (set, get) => ({
      ...DEFAULT_PREFS,
      set: (key, value) => set({ [key]: value } as Partial<PrefsState>),
      patch: (values) => set(values),
      muteFor: (ids, ms) => set(applyMute(get(), ids, ms, Date.now())),
      unmute: (ids) => set(applyUnmute(get(), ids)),
      setCollapsed: (ids, collapsed) => set((s) => ({ collapsedCategories: { ...s.collapsedCategories, ...Object.fromEntries(ids.map((id) => [id, collapsed])) } })),
      setNotifyLevel: (id, level) => set((s) => ({ notifyLevels: { ...s.notifyLevels, [id]: level } })),
      recordReaction: (emoji) => set((s) => ({ recentReactions: recordReaction(s.recentReactions, emoji) })),
      toggleMap: (key, id) => set((s) => ({ [key]: { ...s[key], [id]: !s[key][id] } }) as Partial<PrefsState>),
    }),
    {
      name: 'discordy.prefs.v1',
      storage: createJSONStorage(() => (typeof window === 'undefined' ? memoryStorage() : browserStorage())),
    },
  ),
);
