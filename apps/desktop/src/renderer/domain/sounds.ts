/** Sound effects (Discord-style) and the policy deciding whether one plays. */
export type SoundId = 'selfJoin' | 'selfLeave' | 'userJoin' | 'userLeave' | 'mute' | 'unmute' | 'deafen' | 'undeafen' | 'message';

export const SOUND_OPTIONS: readonly { id: SoundId; label: string }[] = [
  { id: 'selfJoin', label: 'You join a call' },
  { id: 'selfLeave', label: 'You disconnect' },
  { id: 'userJoin', label: 'Someone joins your call' },
  { id: 'userLeave', label: 'Someone leaves your call' },
  { id: 'mute', label: 'Mute' },
  { id: 'unmute', label: 'Unmute' },
  { id: 'deafen', label: 'Deafen' },
  { id: 'undeafen', label: 'Undeafen' },
];

export interface SoundPolicyInput {
  /** Master switch (notifySounds). */
  enabled: boolean;
  /** Per-sound switches; a missing entry means on. */
  toggles: Partial<Record<SoundId, boolean>>;
  doNotDisturb: boolean;
}

/** Whether `sound` may play: master on, that sound on, and not in Do Not Disturb. */
export function shouldPlaySound(sound: SoundId, input: SoundPolicyInput): boolean {
  return input.enabled && !input.doNotDisturb && input.toggles[sound] !== false;
}

export interface VoiceSoundSnapshot {
  /** Connected to a voice channel (status connected). */
  connected: boolean;
  channelId: string | null;
  /** Other users (not me) in my channel. */
  others: readonly string[];
  selfMute: boolean;
  selfDeaf: boolean;
}

/** Sounds triggered by the move from one voice snapshot to the next. */
export function voiceTransitionSounds(prev: VoiceSoundSnapshot, next: VoiceSoundSnapshot): SoundId[] {
  const out: SoundId[] = [];
  if (!prev.connected && next.connected) out.push('selfJoin');
  else if (prev.connected && !next.connected) out.push('selfLeave');
  else if (prev.connected && next.connected && prev.channelId === next.channelId) {
    const before = new Set(prev.others);
    const after = new Set(next.others);
    if (next.others.some((id) => !before.has(id))) out.push('userJoin');
    if (prev.others.some((id) => !after.has(id))) out.push('userLeave');
  }
  if (prev.selfDeaf !== next.selfDeaf) out.push(next.selfDeaf ? 'deafen' : 'undeafen');
  else if (prev.selfMute !== next.selfMute) out.push(next.selfMute ? 'mute' : 'unmute');
  return out;
}
