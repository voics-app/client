/** Layout model of the call stage: grid, focus (speaker + filmstrip) and spotlight (speaker only). */

export type StageMode = 'grid' | 'focus' | 'spotlight';

export interface StageLayoutPrefs {
  mode: StageMode;
  /** Tile key pinned by the user; wins over the transient focus. */
  pinned: string | null;
  hideNonVideo: boolean;
}

export const DEFAULT_STAGE_LAYOUT: StageLayoutPrefs = { mode: 'grid', pinned: null, hideNonVideo: false };

export interface StageTile {
  key: string;
  kind: 'camera' | 'screen' | 'avatar';
  hasVideo: boolean;
  isSelf?: boolean;
}

export interface StageArrangement<T extends StageTile> {
  /** The large tile; null in grid mode. */
  main: T | null;
  /** Tiles below or beside the main tile, or the whole grid. */
  rest: T[];
  /** Tiles dropped by hide-non-video. */
  hidden: number;
  /** The effective layout after fallbacks (a focus mode without a target is a grid). */
  mode: StageMode;
}

export function normalizeLayout(raw: Partial<StageLayoutPrefs> | undefined): StageLayoutPrefs {
  const mode = raw?.mode === 'focus' || raw?.mode === 'spotlight' ? raw.mode : 'grid';
  return { mode, pinned: typeof raw?.pinned === 'string' ? raw.pinned : null, hideNonVideo: raw?.hideNonVideo === true };
}

/**
 * Picks the main tile and the rest. The pinned tile beats the transient focus, which beats the first screen share
 * when a focus layout is selected. Hide-non-video never removes the main tile.
 */
export function arrangeStage<T extends StageTile>(tiles: readonly T[], layout: StageLayoutPrefs, focusedKey: string | null): StageArrangement<T> {
  const byKey = (key: string | null) => (key ? tiles.find((t) => t.key === key) : undefined);
  let main = byKey(layout.pinned) ?? byKey(focusedKey);
  if (!main && layout.mode !== 'grid') main = tiles.find((t) => t.kind === 'screen') ?? tiles.find((t) => t.hasVideo && !t.isSelf) ?? tiles[0];
  const mode: StageMode = main ? (layout.mode === 'grid' ? 'focus' : layout.mode) : 'grid';
  let rest = main ? tiles.filter((t) => t.key !== main!.key) : [...tiles];
  let hidden = 0;
  if (layout.hideNonVideo) {
    const kept = rest.filter((t) => t.hasVideo);
    hidden = rest.length - kept.length;
    rest = kept;
  }
  if (mode === 'spotlight') rest = [];
  return { main: main ?? null, rest, hidden, mode };
}

/** Column count for the adaptive grid. */
export function gridColumns(count: number): number {
  return Math.min(Math.max(1, Math.ceil(Math.sqrt(count))), 4);
}

/** Drops the user's own camera and screen previews when "hide self view" is on; the avatar tile stays so you still see yourself in the call. */
export function withoutSelfPreview<T extends StageTile>(tiles: readonly T[], hide: boolean): T[] {
  return hide ? tiles.filter((t) => !(t.isSelf && t.hasVideo)) : [...tiles];
}

/**
 * Whether the SFU tells a streamer who is watching (STREAM_VIEWERS) and forwards a screen share only to subscribers that
 * opted in through MEDIA_SINK_WANTS, so the viewer UI is shown.
 */
export const STREAM_VIEWER_REPORTING = true;
