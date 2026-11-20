/** Voice states for every guild/DM plus the local call connection. */
import { create } from 'zustand';
import type { VoiceState } from '@discordy/core/contracts/rest';
import { appendRtt } from '@discordy/core/domain/voicePanel';
import type { VideoPresetId } from '@discordy/core/domain/videoPresets';

/**
 * What the platform hands over as a live media stream. The core never inspects it: each app maps it to its
 * own type by augmenting `PlatformMedia` (the desktop sets `stream: MediaStream`); until then it is opaque.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PlatformMedia {}
export type MediaHandle = PlatformMedia extends { stream: infer S } ? S : object;

export type CallStatus = 'idle' | 'requesting' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

export interface RemoteStream {
  userId: string;
  kind: 'camera' | 'screen';
  stream: MediaHandle;
}

export interface CallQuality {
  rttMs: number;
  jitterMs: number;
  lossPct: number;
  bitrateKbps: number;
}

export interface CallState {
  status: CallStatus;
  guildId: string | null;
  channelId: string | null;
  region: string | null;
  error: string | null;
  e2ee: boolean;
  quality: CallQuality | null;
  /** Recent round-trip samples (ms) for the average ping in connection details. */
  rttHistory: number[];
}

export interface VoiceStoreState {
  /** keyed by guild id, or by DM channel id for private calls */
  states: Record<string, Record<string, VoiceState>>;
  call: CallState;
  /** True only while a confirmed, unexpired publication capability is usable. */
  soundboardAvailable: boolean;
  setSoundboardAvailable(available: boolean): void;
  selfMute: boolean;
  selfDeaf: boolean;
  selfVideo: boolean;
  selfStream: boolean;
  streamPreset: VideoPresetId;
  speaking: Record<string, number>;
  remoteStreams: RemoteStream[];
  localCamera: MediaHandle | null;
  localScreen: MediaHandle | null;
  userVolumes: Record<string, number>;
  focusedStream: string | null;
  pipStream: string | null;
  /** Stream keys (`userId:screen`) of remote screen shares the user opted to watch. */
  watching: string[];
  /** Publisher screen SSRCs of remote shares, keyed like `watching`; drives MEDIA_SINK_WANTS. */
  screenSsrcs: Record<string, number>;
  /** Users watching the local screen share, as reported to the streamer (STREAM_VIEWERS). */
  streamViewers: string[];
  /** Hides the user's own camera and screen preview tiles on the stage. */
  hideSelfPreview: boolean;
  upsertState(state: VoiceState): void;
  hydrate(scopeId: string, states: VoiceState[]): void;
  setCall(patch: Partial<CallState>): void;
  setSelf(patch: Partial<Pick<VoiceStoreState, 'selfMute' | 'selfDeaf' | 'selfVideo' | 'selfStream' | 'streamPreset'>>): void;
  setSpeaking(userId: string, level: number): void;
  setRemoteStream(stream: RemoteStream): void;
  removeRemoteStreams(userId: string, kind?: RemoteStream['kind']): void;
  setScreenSsrc(streamKey: string, ssrc: number): void;
  setStreamViewers(userIds: string[]): void;
  setLocalMedia(patch: Partial<Pick<VoiceStoreState, 'localCamera' | 'localScreen'>>): void;
  setUserVolume(userId: string, volume: number): void;
  focus(streamKey: string | null): void;
  popOut(streamKey: string | null): void;
  watchStream(streamKey: string): void;
  stopWatching(streamKey: string): void;
  setHideSelfPreview(hide: boolean): void;
  resetCall(): void;
}

const idleCall: CallState = { status: 'idle', guildId: null, channelId: null, region: null, error: null, e2ee: false, quality: null, rttHistory: [] };

export const scopeOf = (state: Pick<VoiceState, 'guild_id' | 'channel_id'>): string | null => state.guild_id ?? state.channel_id;

export const useVoiceStore = create<VoiceStoreState>((set) => ({
  states: {},
  call: idleCall,
  soundboardAvailable: false,
  setSoundboardAvailable: (soundboardAvailable) => set({ soundboardAvailable }),
  selfMute: false,
  selfDeaf: false,
  selfVideo: false,
  selfStream: false,
  streamPreset: '1080p60',
  speaking: {},
  remoteStreams: [],
  localCamera: null,
  localScreen: null,
  userVolumes: {},
  focusedStream: null,
  pipStream: null,
  watching: [],
  screenSsrcs: {},
  streamViewers: [],
  hideSelfPreview: false,
  upsertState: (state) =>
    set((s) => {
      // A user is in at most one call: drop them from every other scope first.
      const states: VoiceStoreState['states'] = {};
      for (const [scope, users] of Object.entries(s.states)) {
        const { [state.user_id]: _removed, ...rest } = users;
        states[scope] = rest;
      }
      const scope = state.guild_id ?? (state.channel_id ? state.channel_id : null);
      if (state.channel_id && scope) states[scope] = { ...(states[scope] ?? {}), [state.user_id]: state };
      return { states };
    }),
  hydrate: (scopeId, list) => set((s) => ({ states: { ...s.states, [scopeId]: Object.fromEntries(list.map((v) => [v.user_id, v])) } })),
  setCall: (patch) =>
    set((s) => {
      const rttHistory = patch.quality ? appendRtt(s.call.rttHistory, patch.quality.rttMs) : patch.rttHistory ?? s.call.rttHistory;
      return { call: { ...s.call, ...patch, rttHistory } };
    }),
  setSelf: (patch) => set(patch),
  setSpeaking: (userId, level) => set((s) => ({ speaking: { ...s.speaking, [userId]: level } })),
  setRemoteStream: (stream) =>
    set((s) => ({
      remoteStreams: [...s.remoteStreams.filter((r) => !(r.userId === stream.userId && r.kind === stream.kind)), stream],
    })),
  removeRemoteStreams: (userId, kind) =>
    set((s) => ({
      remoteStreams: s.remoteStreams.filter((r) => r.userId !== userId || (kind !== undefined && r.kind !== kind)),
      // A share that ended must be opted into again next time.
      watching: s.watching.filter((k) => !k.startsWith(`${userId}:`) || (kind !== undefined && k !== `${userId}:${kind}`)),
      focusedStream: s.focusedStream && s.focusedStream.startsWith(`${userId}:`) && (kind === undefined || s.focusedStream === `${userId}:${kind}`) ? null : s.focusedStream,
    })),
  setScreenSsrc: (key, ssrc) =>
    set((s) => {
      if (ssrc > 0) return s.screenSsrcs[key] === ssrc ? s : { screenSsrcs: { ...s.screenSsrcs, [key]: ssrc } };
      if (!(key in s.screenSsrcs)) return s;
      const { [key]: _gone, ...screenSsrcs } = s.screenSsrcs;
      return { screenSsrcs };
    }),
  setStreamViewers: (streamViewers) => set({ streamViewers }),
  // Nobody watches a share that has stopped.
  setLocalMedia: (patch) => set(patch.localScreen === null ? { ...patch, streamViewers: [] } : patch),
  setUserVolume: (userId, volume) => set((s) => ({ userVolumes: { ...s.userVolumes, [userId]: Math.max(0, Math.min(2, volume)) } })),
  focus: (focusedStream) => set({ focusedStream }),
  popOut: (pipStream) => set({ pipStream }),
  watchStream: (key) => set((s) => (s.watching.includes(key) ? s : { watching: [...s.watching, key] })),
  stopWatching: (key) => set((s) => ({ watching: s.watching.filter((k) => k !== key), focusedStream: s.focusedStream === key ? null : s.focusedStream, pipStream: s.pipStream === key ? null : s.pipStream })),
  setHideSelfPreview: (hideSelfPreview) => set({ hideSelfPreview }),
  resetCall: () =>
    set({ call: idleCall, soundboardAvailable: false, speaking: {}, remoteStreams: [], localCamera: null, localScreen: null, selfVideo: false, selfStream: false, focusedStream: null, pipStream: null, watching: [], screenSsrcs: {}, streamViewers: [] }),
}));

export function usersInChannel(states: VoiceStoreState['states'], scopeId: string | null | undefined, channelId: string): VoiceState[] {
  if (!scopeId) return [];
  return Object.values(states[scopeId] ?? {}).filter((v) => v.channel_id === channelId);
}
