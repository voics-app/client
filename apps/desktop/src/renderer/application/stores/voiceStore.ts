/** Voice states for every guild/DM plus the local call connection. */
import { create } from 'zustand';
import type { VoiceState } from '@shared/contracts/rest';
import type { VideoPresetId } from '@renderer/domain/videoPresets';

export type CallStatus = 'idle' | 'requesting' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

export interface RemoteStream {
  userId: string;
  kind: 'camera' | 'screen';
  stream: MediaStream;
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
}

export interface VoiceStoreState {
  /** keyed by guild id, or by DM channel id for private calls */
  states: Record<string, Record<string, VoiceState>>;
  call: CallState;
  selfMute: boolean;
  selfDeaf: boolean;
  selfVideo: boolean;
  selfStream: boolean;
  streamPreset: VideoPresetId;
  speaking: Record<string, number>;
  remoteStreams: RemoteStream[];
  localCamera: MediaStream | null;
  localScreen: MediaStream | null;
  userVolumes: Record<string, number>;
  focusedStream: string | null;
  pipStream: string | null;
  upsertState(state: VoiceState): void;
  hydrate(scopeId: string, states: VoiceState[]): void;
  setCall(patch: Partial<CallState>): void;
  setSelf(patch: Partial<Pick<VoiceStoreState, 'selfMute' | 'selfDeaf' | 'selfVideo' | 'selfStream' | 'streamPreset'>>): void;
  setSpeaking(userId: string, level: number): void;
  setRemoteStream(stream: RemoteStream): void;
  removeRemoteStreams(userId: string, kind?: RemoteStream['kind']): void;
  setLocalMedia(patch: Partial<Pick<VoiceStoreState, 'localCamera' | 'localScreen'>>): void;
  setUserVolume(userId: string, volume: number): void;
  focus(streamKey: string | null): void;
  popOut(streamKey: string | null): void;
  resetCall(): void;
}

const idleCall: CallState = { status: 'idle', guildId: null, channelId: null, region: null, error: null, e2ee: false, quality: null };

export const scopeOf = (state: Pick<VoiceState, 'guild_id' | 'channel_id'>): string | null => state.guild_id ?? state.channel_id;

export const useVoiceStore = create<VoiceStoreState>((set) => ({
  states: {},
  call: idleCall,
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
  setCall: (patch) => set((s) => ({ call: { ...s.call, ...patch } })),
  setSelf: (patch) => set(patch),
  setSpeaking: (userId, level) => set((s) => ({ speaking: { ...s.speaking, [userId]: level } })),
  setRemoteStream: (stream) =>
    set((s) => ({
      remoteStreams: [...s.remoteStreams.filter((r) => !(r.userId === stream.userId && r.kind === stream.kind)), stream],
    })),
  removeRemoteStreams: (userId, kind) =>
    set((s) => ({ remoteStreams: s.remoteStreams.filter((r) => r.userId !== userId || (kind !== undefined && r.kind !== kind)) })),
  setLocalMedia: (patch) => set(patch),
  setUserVolume: (userId, volume) => set((s) => ({ userVolumes: { ...s.userVolumes, [userId]: Math.max(0, Math.min(2, volume)) } })),
  focus: (focusedStream) => set({ focusedStream }),
  popOut: (pipStream) => set({ pipStream }),
  resetCall: () =>
    set({ call: idleCall, speaking: {}, remoteStreams: [], localCamera: null, localScreen: null, selfVideo: false, selfStream: false, focusedStream: null, pipStream: null }),
}));

export function usersInChannel(states: VoiceStoreState['states'], scopeId: string | null | undefined, channelId: string): VoiceState[] {
  if (!scopeId) return [];
  return Object.values(states[scopeId] ?? {}).filter((v) => v.channel_id === channelId);
}
