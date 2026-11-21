/**
 * Pure rules for the video stage of a call, the phone's take on desktop's VoiceStage: who gets a tile, which tile is large, and the layout.
 * Tile order, focus and the grid column count come from core (domain/stageLayout), so phone and desktop arrange a call the same way.
 */
import type { RemoteStream } from '@discordy/core/application/stores/voiceStore';
import { DEFAULT_STAGE_LAYOUT, arrangeStage, gridColumns, type StageTile } from '@discordy/core/domain/stageLayout';
import type { NativeVideoStream } from './nativeVoice';
import type { ParticipantRow } from './voiceModel';

export interface StageTileModel extends StageTile {
  row: ParticipantRow;
  /** What to render; null for an avatar tile, or for a screen share that is not being watched. */
  stream: NativeVideoStream | null;
  /** A remote screen share that exists but is not watched: the tile offers Watch. */
  watchable: boolean;
}

export type StageView =
  /** Nobody has video: the participant list of a voice call. */
  | { mode: 'list' }
  /** One to one: the other person fills the stage and you are a small tile in the corner. */
  | { mode: 'duo'; remote: StageTileModel; self: StageTileModel }
  /** One large tile with the rest in a strip. */
  | { mode: 'focus'; main: StageTileModel; strip: StageTileModel[] }
  | { mode: 'grid'; tiles: StageTileModel[]; columns: number };

export interface TilesInput {
  rows: readonly ParticipantRow[];
  remote: readonly RemoteStream[];
  localCamera: NativeVideoStream | null;
  localScreen?: NativeVideoStream | null;
  /** Keys (`userId:screen`) of remote screen shares that exist. */
  screenKeys: readonly string[];
  /** Keys of the screen shares the user chose to watch. */
  watching: readonly string[];
}

export const tileKey = (userId: string, kind: 'main' | 'screen'): string => `${userId}:${kind}`;

/** One tile per person (camera or avatar), plus one per remote screen share. */
export function buildTiles({ rows, remote, localCamera, localScreen, screenKeys, watching }: TilesInput): StageTileModel[] {
  const tiles: StageTileModel[] = [];
  for (const row of rows) {
    const camera = row.self ? localCamera : ((remote.find((r) => r.userId === row.userId && r.kind === 'camera')?.stream as NativeVideoStream | undefined) ?? null);
    tiles.push({ key: tileKey(row.userId, 'main'), kind: camera ? 'camera' : 'avatar', hasVideo: camera !== null, isSelf: row.self, row, stream: camera, watchable: false });
    const screenKey = tileKey(row.userId, 'screen');
    if (row.self && localScreen) tiles.push({ key: screenKey, kind: 'screen', hasVideo: false, isSelf: true, row, stream: null, watchable: false });
    if (row.self || !screenKeys.includes(screenKey)) continue;
    const watched = watching.includes(screenKey);
    const stream = watched ? ((remote.find((r) => r.userId === row.userId && r.kind === 'screen')?.stream as NativeVideoStream | undefined) ?? null) : null;
    tiles.push({ key: screenKey, kind: 'screen', hasVideo: stream !== null, isSelf: false, row, stream, watchable: !watched });
  }
  return tiles;
}

/** Chooses the layout. A focused tile (tapped by the user) wins; two people is a duo; more is a grid. Without any video it is the plain list. */
export function stageView(tiles: readonly StageTileModel[], focusedKey: string | null): StageView {
  const hasStage = tiles.some((t) => t.hasVideo || t.kind === 'screen');
  if (!hasStage) return { mode: 'list' };
  const focused = tiles.find((t) => t.key === focusedKey);
  if (focused) {
    const { main, rest } = arrangeStage(tiles, { ...DEFAULT_STAGE_LAYOUT, mode: 'focus' }, focusedKey);
    if (main) return { mode: 'focus', main, strip: rest };
  }
  const people = tiles.filter((t) => t.kind !== 'screen');
  const self = people.find((t) => t.isSelf);
  const other = people.find((t) => !t.isSelf);
  if (tiles.length === 2 && people.length === 2 && self && other) return { mode: 'duo', remote: other, self };
  return { mode: 'grid', tiles: [...tiles], columns: Math.min(gridColumns(tiles.length), 2) };
}
