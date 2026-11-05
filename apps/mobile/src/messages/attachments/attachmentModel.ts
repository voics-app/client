import type { Attachment } from '@discordy/core/contracts/rest';
import { gridLayout, gridTiles, previewKind } from '@discordy/core/domain/media';
import { uploadFraction } from '@discordy/core/application/stores/uploadStore';

/** Widest the media of one message may be; narrower on small phones. */
export const MAX_MEDIA_WIDTH = 320;
const TILE_ROW_HEIGHT = 140;
const MIN_ASPECT = 0.6;
const MAX_ASPECT = 1.8;

export interface TileRow {
  /** One flex weight per tile, from the column span of Discord's grid. */
  spans: number[];
  height: number;
}

/**
 * The media grid as rows of tiles. One image keeps its shape (within limits); two and more follow `gridLayout`, with a single tall tile
 * beside two stacked ones for three. At most four tiles show; the rest collapse into a "+N" on the last tile.
 */
export function tileRows(count: number): { rows: TileRow[]; shown: number; hidden: number; tallFirst: boolean } {
  const { shown, hidden } = gridTiles(count);
  const layout = gridLayout(shown);
  const tallFirst = shown === 3;
  if (tallFirst) return { rows: [{ spans: [1, 1], height: TILE_ROW_HEIGHT * 2 }], shown, hidden, tallFirst };
  const rows: TileRow[] = [];
  for (const cell of layout.cells) {
    const row = rows[cell.rowStart - 1] ?? (rows[cell.rowStart - 1] = { spans: [], height: TILE_ROW_HEIGHT });
    row.spans.push(cell.colSpan);
  }
  return { rows, shown, hidden, tallFirst };
}

/** Size of a lone image: its aspect ratio clamped so tall screenshots and panoramas stay manageable. */
export function singleMediaSize(attachment: Pick<Attachment, 'width' | 'height'>, maxWidth: number): { width: number; height: number } {
  const w = attachment.width ?? 0;
  const h = attachment.height ?? 0;
  const aspect = w > 0 && h > 0 ? Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, w / h)) : 4 / 3;
  const width = Math.min(maxWidth, MAX_MEDIA_WIDTH);
  return { width, height: Math.round(width / aspect) };
}

export function isViewable(attachment: Pick<Attachment, 'filename' | 'content_type' | 'size'>): boolean {
  const kind = previewKind(attachment);
  return kind === 'image' || kind === 'video';
}

/** "Uploading 45%" for the unsent message's progress line. */
export function uploadLabel(upload: { loaded: number; total: number } | undefined): string {
  return `Uploading ${Math.round(uploadFraction(upload) * 100)}%`;
}
