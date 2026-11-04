/** Device-local preferences (appearance, voice, keybinds, notifications), persisted to localStorage. */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistedStorage } from '@renderer/application/ports/deviceStorage';
import type { SoundId } from '@discordy/core/domain/sounds';
import { DEFAULT_RINGTONE, DEFAULT_RINGTONE_VOLUME, type RingtoneId } from '@discordy/core/domain/ringtones';
import type { VideoPresetId } from '@discordy/core/domain/videoPresets';
import { DEFAULT_STAGE_LAYOUT, normalizeLayout, type StageLayoutPrefs } from '@discordy/core/domain/stageLayout';
import type { RoleColorMode } from '@discordy/core/domain/appearance';
import type { SpoilerDisplay, ThemeId } from '@discordy/core/domain/prefsTypes';
import { recordReaction, type QuickEmoji } from '@discordy/core/domain/quickReactions';

export type { ThemeId, SpoilerDisplay };
export type AccentId = 'iris' | 'aurora' | 'ember' | 'rose' | 'citrine' | 'sky';
export type Density = 'cozy' | 'compact';
export type InputMode = 'vad' | 'ptt';
/** Device-local notification level for a channel or category until server-side settings exist (api#28). */
export type NotifyLevel = 'all' | 'mentions' | 'none';

import { DEFAULT_KEYBINDS, mergeKeybinds, type Keybind } from '@discordy/core/domain/keybinds';
export type { Keybind };


export interface PrefsState {
  theme: ThemeId;
  accent: AccentId;
  reduceMotion: boolean;
  density: Density;
  fontScale: number;
  showAvatarsInCompact: boolean;
  /** Pixels between message groups (synced). */
  messageSpacing: number;
  /** Colour saturation of the whole interface, 1 is full colour (synced). */
  saturation: number;
  roleColors: RoleColorMode;
  linkUnderline: boolean;
  highContrast: boolean;
  animateGifs: boolean;
  animateEmoji: boolean;
  animateStickers: boolean;
  /** Allow /tts and read text-to-speech messages aloud (synced). */
  ttsReadAloud: boolean;
  ttsRate: number;
  /** Follow the operating system's light or dark setting (device-local). */
  syncOsTheme: boolean;
  /** Follow the operating system's reduced-motion setting (device-local). */
  syncOsMotion: boolean;
  /** UI zoom factor set with Ctrl +, Ctrl - and Ctrl 0 (device-local). */
  zoom: number;
  /** Row height of the channel list (device-local). */
  channelListDensity: Density;
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
  /** Ask "Start a voice call with X?" before a DM call starts ringing (device-local, default on). */
  confirmCalls: boolean;
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
  /** Show attached images and videos inline (device-local). */
  inlineMedia: boolean;
  /** Show embeds and rich link cards under messages (device-local). */
  inlineEmbeds: boolean;
  spoilerDisplay: SpoilerDisplay;
  /** Turn typed emoticons such as :) into emoji when sending (device-local). */
  convertEmoticons: boolean;
  /** Show reaction chips under messages (device-local). */
  showReactions: boolean;
  /** Enter inserts a newline and Ctrl+Enter sends. Read by the composer (device-local). */
  sendWithCtrlEnter: boolean;
  /** Shrink the quoted message above a reply to a single line (device-local). */
  compactReplyPreview: boolean;
  /** Developer mode: shows every Copy ID entry (device-local). */
  developerMode: boolean;
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

export { DEFAULT_KEYBINDS };

export const DEFAULT_PREFS: PrefsData = {
  theme: 'dark',
  accent: 'iris',
  reduceMotion: false,
  density: 'cozy',
  fontScale: 1,
  showAvatarsInCompact: false,
  messageSpacing: 16,
  saturation: 1,
  roleColors: 'name',
  linkUnderline: false,
  highContrast: false,
  animateGifs: true,
  animateEmoji: true,
  animateStickers: true,
  ttsReadAloud: false,
  ttsRate: 1,
  syncOsTheme: false,
  syncOsMotion: true,
  zoom: 1,
  channelListDensity: 'cozy',
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
  confirmCalls: true,
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
  inlineMedia: true,
  inlineEmbeds: true,
  spoilerDisplay: 'click',
  convertEmoticons: true,
  showReactions: true,
  sendWithCtrlEnter: false,
  compactReplyPreview: false,
  developerMode: false,
  mediaVolume: 1,
  mediaMuted: false,
};

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
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<PrefsState>), keybinds: mergeKeybinds((persisted as Partial<PrefsState> | undefined)?.keybinds) }),
      storage: persistedStorage(),
    },
  ),
);

/** Selector for the composer: true when Ctrl+Enter sends and plain Enter makes a new line. */
export const selectSendWithCtrlEnter = (s: Pick<PrefsData, 'sendWithCtrlEnter'>): boolean => s.sendWithCtrlEnter;
