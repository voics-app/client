import { create } from 'zustand';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { bridge } from './bridge';

interface StreamerRuntime { detected: boolean | null; setDetected(value: boolean | null): void }
export const useStreamerRuntime = create<StreamerRuntime>((set) => ({ detected: null, setDetected: (detected) => set({ detected }) }));
export const streamerActive = (): boolean => {
  const prefs = usePrefsStore.getState();
  return prefs.streamerMode || (prefs.streamerAutoDetect && useStreamerRuntime.getState().detected !== false);
};
export function useStreamerActive(): boolean {
  const manual = usePrefsStore((s) => s.streamerMode);
  const auto = usePrefsStore((s) => s.streamerAutoDetect);
  const detected = useStreamerRuntime((s) => s.detected);
  return manual || (auto && detected !== false);
}

/** Poll only while enabled; an in-flight result is ignored after cleanup. */
export function startObsDetection(): () => void {
  let stopped = false;
  let inFlight = false;
  let generation = 0;
  const poll = async () => {
    if (!usePrefsStore.getState().streamerAutoDetect || !bridge?.app.obsRunning) {
      useStreamerRuntime.getState().setDetected(null);
      return;
    }
    if (inFlight) return;
    inFlight = true;
    const mine = generation;
    try {
      const detected = await bridge.app.obsRunning();
      if (!stopped && mine === generation && usePrefsStore.getState().streamerAutoDetect) useStreamerRuntime.getState().setDetected(detected);
    } catch {
      if (!stopped && mine === generation) useStreamerRuntime.getState().setDetected(null);
    } finally { inFlight = false; if (!stopped && mine !== generation) void poll(); }
  };
  void poll();
  const interval = setInterval(() => void poll(), 5000);
  const unsubscribe = usePrefsStore.subscribe((s, p) => { if (s.streamerAutoDetect !== p.streamerAutoDetect) { generation += 1; void poll(); } });
  return () => { stopped = true; clearInterval(interval); unsubscribe(); useStreamerRuntime.getState().setDetected(null); };
}
