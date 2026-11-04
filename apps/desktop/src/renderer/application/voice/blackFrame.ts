/**
 * Heuristic detection of DRM-protected capture. Protected surfaces (Netflix,
 * Disney+, ...) render as solid black in screen capture by design; we never try
 * to bypass that. When a freshly started capture stays black we tell the UI so
 * it can offer Watch Together instead.
 */

/** True when every sampled pixel is darker than `maxLuma` (BT.601 luma, alpha ignored). */
export function isBlackFrame(rgba: ArrayLike<number>, maxLuma = 6, stride = 4 * 7): boolean {
  if (rgba.length < 4) return false;
  for (let i = 0; i + 2 < rgba.length; i += stride) {
    const luma = 0.299 * (rgba[i] ?? 0) + 0.587 * (rgba[i + 1] ?? 0) + 0.114 * (rgba[i + 2] ?? 0);
    if (luma > maxLuma) return false;
  }
  return true;
}

export interface FrameSampler {
  /** RGBA pixels of the current frame, or null when no frame is available yet. */
  sample(): Promise<ArrayLike<number> | null>;
  dispose(): void;
}

export interface DetectOptions {
  durationMs?: number;
  intervalMs?: number;
  wait?: (ms: number) => Promise<void>;
}

/** Resolves true when at least two frames were sampled and all were black. */
export async function detectProtectedContent(sampler: FrameSampler, options: DetectOptions = {}): Promise<boolean> {
  const { durationMs = 1500, intervalMs = 300, wait = (ms) => new Promise<void>((r) => setTimeout(r, ms)) } = options;
  let frames = 0;
  for (let elapsed = 0; elapsed <= durationMs; elapsed += intervalMs) {
    const pixels = await sampler.sample();
    if (pixels) {
      frames += 1;
      if (!isBlackFrame(pixels)) return false;
    }
    await wait(intervalMs);
  }
  return frames >= 2;
}
