/** Chromium 110+ extension missing from lib.dom. */
interface AudioContext {
  setSinkId?(sinkId: string): Promise<void>;
}
