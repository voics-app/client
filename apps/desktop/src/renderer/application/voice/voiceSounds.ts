/** Plays the Discord-style voice sounds as the local call and its participants change. */
import { shouldPlaySound, voiceTransitionSounds, type SoundId, type SoundPolicyInput, type VoiceSoundSnapshot } from '@discordy/core/domain/sounds';

export interface VoiceSoundDeps {
  play(sound: SoundId): void;
  policy(): SoundPolicyInput;
}

export const IDLE_SNAPSHOT: VoiceSoundSnapshot = { connected: false, channelId: null, others: [], selfMute: false, selfDeaf: false };

export class VoiceSounds {
  private last: VoiceSoundSnapshot = IDLE_SNAPSHOT;

  constructor(private readonly deps: VoiceSoundDeps) {}

  update(next: VoiceSoundSnapshot): void {
    const sounds = voiceTransitionSounds(this.last, next);
    this.last = next;
    const policy = this.deps.policy();
    for (const sound of sounds) if (shouldPlaySound(sound, policy)) this.deps.play(sound);
  }
}
