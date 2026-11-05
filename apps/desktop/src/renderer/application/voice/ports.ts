/** Ports the desktop voice application layer depends on. The platform-free ones live in @discordy/core. */
import type { MediaTrackLike } from '@discordy/core/application/ports/media';
import type { MicPort as CoreMicPort } from '@discordy/core/application/ports/voice';

export type { MixerPort, ScreenTrackOptions, SessionClosed, SessionStatus, VoiceSessionPort } from '@discordy/core/application/ports/voice';

export interface MicPort extends CoreMicPort {
  /** Mixes shared-screen audio into the outgoing track (ungated); null removes it. */
  setSoundshare(stream: MediaStream | null): void;
  /** Re-reads prefs (devices, constraints, VAD/PTT); resolves a new track when capture had to restart, else null. */
  reconfigure(): Promise<MediaTrackLike | null>;
}
