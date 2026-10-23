/** Text-to-speech through the platform's speech synthesis. */
export interface SpeechTarget {
  speak(utterance: unknown): void;
  cancel(): void;
}

export function speak(text: string, rate: number, synth: SpeechTarget | undefined = typeof window === 'undefined' ? undefined : window.speechSynthesis, make: (text: string) => { rate: number } = (t) => new SpeechSynthesisUtterance(t)): boolean {
  const clean = text.replace(/<a?:(\w+):\d+>/g, '$1').replace(/<[@#&!]+\d+>/g, '').replace(/https?:\/\/\S+/g, 'link').replace(/[*_~`|>]/g, '').trim();
  if (!synth || !clean) return false;
  const utterance = make(clean.slice(0, 500));
  utterance.rate = Math.min(2, Math.max(0.5, rate));
  synth.speak(utterance);
  return true;
}

export function stopSpeaking(synth: SpeechTarget | undefined = typeof window === 'undefined' ? undefined : window.speechSynthesis): void {
  synth?.cancel();
}
