/**
 * One long-lived AudioContext shared by every UI sound (ringtone, ringback, effects). Sound that
 * starts without a click (an incoming call, a message) needs a context the page has already
 * unlocked, so the first pointer or key press resumes it; the main process also lifts Chromium's
 * autoplay policy, and this is the second line of defence.
 */
let shared: AudioContext | null = null;

export function sharedAudioContext(): AudioContext {
  if (!shared || shared.state === 'closed') shared = new AudioContext({ latencyHint: 'interactive' });
  return shared;
}

/** Resumes a context the browser suspended or interrupted; a failure is logged, never silent. */
export function wakeContext(context: AudioContext): void {
  const state = context.state as string;
  if (state !== 'suspended' && state !== 'interrupted') return;
  void context.resume().catch((error) => console.warn('audio context could not resume', error));
}

const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

/** Unlocks the shared context on the first user gesture. Returns the function that removes the listeners. */
export function installAudioUnlock(
  target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> = document,
  acquire: () => AudioContext = sharedAudioContext,
): () => void {
  const unlock = () => {
    const context = acquire();
    wakeContext(context);
    if (context.state === 'running') remove();
  };
  const remove = () => UNLOCK_EVENTS.forEach((name) => target.removeEventListener(name, unlock, true));
  UNLOCK_EVENTS.forEach((name) => target.addEventListener(name, unlock, true));
  unlock();
  return remove;
}
