export interface StickerLottie {
  v: string; fr: number; ip: number; op: number; w: number; h: number;
  assets: unknown[]; layers: unknown[];
}

/** Reject external assets and expressions before handing uploaded Lottie to a renderer. */
export function parseStickerLottie(source: string): StickerLottie {
  if (source.length > 512 * 1024) throw new Error('Sticker too large');
  const data: unknown = JSON.parse(source);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid sticker');
  const object = data as Record<string, unknown>;
  if (object.w !== 320 || object.h !== 320 || typeof object.v !== 'string' || !Array.isArray(object.layers)) throw new Error('Invalid sticker');
  if (typeof object.fr !== 'number' || !Number.isFinite(object.fr) || object.fr <= 0 || object.fr > 120 || typeof object.ip !== 'number' || typeof object.op !== 'number' || !Number.isFinite(object.ip) || !Number.isFinite(object.op) || object.op <= object.ip || object.op - object.ip > object.fr * 60) throw new Error('Invalid sticker timing');
  if (object.assets === undefined) object.assets = [];
  if (!Array.isArray(object.assets)) throw new Error('Invalid sticker assets');
  const unsafe = (value: unknown, depth: number): boolean => {
    if (depth > 128) return true;
    if (!value || typeof value !== 'object') return false;
    if (Array.isArray(value)) return value.some((entry) => unsafe(entry, depth + 1));
    return Object.entries(value).some(([key, entry]) => ((key === 'p' || key === 'u' || key === 'x') && typeof entry === 'string') || unsafe(entry, depth + 1));
  };
  if (unsafe(data, 0)) throw new Error('Unsupported sticker');
  return object as unknown as StickerLottie;
}
