/**
 * Port for text-to-speech (the browser's speech synthesis on desktop, AVSpeechSynthesizer on mobile).
 * `speak` is a no-op that reports false until the composition root installs an adapter.
 */
export interface SpeechPort {
  /** Reads `text` aloud at `rate`; false when nothing was spoken. */
  speak(text: string, rate: number): boolean;
}

let adapter: SpeechPort = { speak: () => false };

export function installSpeech(next: SpeechPort): void {
  adapter = next;
}

export const speech: SpeechPort = { speak: (text, rate) => adapter.speak(text, rate) };
