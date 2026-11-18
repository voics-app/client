import { AttachmentFlag, type Attachment, type Embed, type EmbedMedia } from '../contracts/rest';

/** Discord's convention: a file named `SPOILER_x.png` is a spoiler. */
export const SPOILER_PREFIX = 'SPOILER_';
export const ALT_TEXT_MAX = 1024;
/** Text files larger than this are not previewed inline. */
export const TEXT_PREVIEW_MAX_BYTES = 256 * 1024;
/** Characters shown before "Show more" in a text preview. */
export const TEXT_PREVIEW_LINES = 12;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;

export function isSpoilerName(filename: string): boolean {
  return filename.startsWith(SPOILER_PREFIX);
}

/** Explicit server flags are authoritative; only legacy/private payloads omit them. */
export function isSpoiler(attachment: Pick<Attachment, 'filename' | 'flags'>): boolean {
  return attachment.flags !== undefined ? (attachment.flags & AttachmentFlag.IS_SPOILER) !== 0 : isSpoilerName(attachment.filename);
}

export function withSpoilerPrefix(filename: string): string {
  return isSpoilerName(filename) ? filename : `${SPOILER_PREFIX}${filename}`;
}

export function withoutSpoilerPrefix(filename: string): string {
  return isSpoilerName(filename) ? filename.slice(SPOILER_PREFIX.length) : filename;
}

/** The name to show: the spoiler prefix is a transport detail. */
export function displayFilename(filename: string): string {
  return withoutSpoilerPrefix(filename) || filename;
}

export type PreviewKind = 'image' | 'video' | 'audio' | 'text' | 'pdf' | 'file';

const CODE_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env', 'log', 'csv', 'tsv', 'xml', 'html', 'css', 'scss',
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'py', 'rb', 'rs', 'go', 'java', 'kt', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'sh', 'bash', 'ps1', 'sql', 'lua', 'swift', 'ex', 'exs', 'diff', 'patch',
]);

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot < 0 ? '' : filename.slice(dot + 1).toLowerCase();
}

export function previewKind(attachment: Pick<Attachment, 'filename' | 'content_type' | 'size'>): PreviewKind {
  const type = (attachment.content_type ?? '').toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type === 'application/pdf' || extensionOf(attachment.filename) === 'pdf') return 'pdf';
  const textual = type.startsWith('text/') || type === 'application/json' || CODE_EXTENSIONS.has(extensionOf(attachment.filename));
  return textual && attachment.size > 0 && attachment.size <= TEXT_PREVIEW_MAX_BYTES ? 'text' : 'file';
}

/** Images and videos lay out in the media grid; every other file is listed below it. */
export function splitAttachments(attachments: Attachment[]): { media: Attachment[]; files: Attachment[] } {
  const media: Attachment[] = [];
  const files: Attachment[] = [];
  for (const attachment of attachments) {
    const kind = previewKind(attachment);
    (kind === 'image' || kind === 'video' ? media : files).push(attachment);
  }
  return { media, files };
}

export interface GridCell {
  colStart: number;
  colSpan: number;
  rowStart: number;
  rowSpan: number;
}

export interface GridLayout {
  /** Columns of the CSS grid (a common multiple, so every row can be filled exactly). */
  columns: 6;
  rows: number;
  cells: GridCell[];
}

const ROW_PLANS: Record<number, number[]> = {
  1: [1],
  2: [2],
  4: [2, 2],
  5: [2, 3],
  6: [3, 3],
  7: [1, 3, 3],
  8: [2, 3, 3],
  9: [3, 3, 3],
  10: [1, 3, 3, 3],
};

/** Discord's media grid: 1 large, 2 side by side, 3 as one tall plus two, then rows of 2 and 3. */
export function gridLayout(count: number): GridLayout {
  const n = Math.max(1, Math.min(10, Math.floor(count)));
  if (n === 3) {
    return {
      columns: 6,
      rows: 2,
      cells: [
        { colStart: 1, colSpan: 3, rowStart: 1, rowSpan: 2 },
        { colStart: 4, colSpan: 3, rowStart: 1, rowSpan: 1 },
        { colStart: 4, colSpan: 3, rowStart: 2, rowSpan: 1 },
      ],
    };
  }
  const plan = ROW_PLANS[n]!;
  const cells: GridCell[] = [];
  plan.forEach((perRow, row) => {
    const span = 6 / perRow;
    for (let i = 0; i < perRow; i += 1) cells.push({ colStart: 1 + i * span, colSpan: span, rowStart: row + 1, rowSpan: 1 });
  });
  return { columns: 6, rows: plan.length, cells };
}

/** Largest media grid in a message; any further images collapse into a "+N" on the last tile. */
export const MAX_GRID_TILES = 4;

export function gridTiles(count: number): { shown: number; hidden: number } {
  const shown = Math.min(count, MAX_GRID_TILES);
  return { shown, hidden: count - shown };
}

const SWIPE_DISTANCE = 50;

/** +1 (next) for a swipe left, -1 (previous) for a swipe right, 0 for a tap or a mostly vertical drag. */
export function swipeDirection(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

/** Next index in a ring of `count` items. */
export function stepIndex(index: number, count: number, delta: number): number {
  if (count <= 0) return 0;
  return (((index + delta) % count) + count) % count;
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Keeps a zoomed image from being dragged out of view: at most half the overflow on each side. */
export function clampPan(offset: number, viewport: number, zoom: number): number {
  const limit = (viewport * (zoom - 1)) / 2;
  return Math.min(limit, Math.max(-limit, offset));
}

/** Hosts that may be shown as an embedded player; must match the messages service's list. */
export const PLAYER_IFRAME_HOSTS = ['www.youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com', 'open.spotify.com', 'w.soundcloud.com', 'www.dailymotion.com'] as const;

export function isPlayerIframeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && PLAYER_IFRAME_HOSTS.some((host) => host === parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * The only address an embed image may load from: the signed media proxy. A missing proxy URL means
 * the image is not shown, so a client never contacts a third-party host directly.
 */
export function embedMediaSrc(media: EmbedMedia | undefined): string | null {
  return media?.proxy_url ?? null;
}

export type EmbedPlayback = { kind: 'iframe'; src: string } | { kind: 'file'; src: string } | null;

/** How an embed's `video` plays: an allow-listed iframe player, a proxied file, or not at all. */
export function embedPlayback(embed: Embed): EmbedPlayback {
  const video = embed.video;
  if (!video?.url) return null;
  if (isPlayerIframeUrl(video.url)) return { kind: 'iframe', src: video.url };
  return video.proxy_url ? { kind: 'file', src: video.proxy_url } : null;
}

/** Embed types the messages service generates from links; bots send `rich` or none. */
const LINK_PREVIEW_TYPES = new Set<string>(['link', 'image', 'video', 'gifv', 'article']);

export function isLinkPreview(embed: Embed): boolean {
  return embed.type !== undefined && LINK_PREVIEW_TYPES.has(embed.type);
}

/** An `image`/`gifv`/direct-media embed has nothing but the media: show it without a card. */
export function isBareMediaEmbed(embed: Embed): boolean {
  return (embed.type === 'image' || embed.type === 'gifv') && !embed.title && !embed.description;
}

/** The flag patch for the hover "x": hides every preview of the message. */
export const SUPPRESS_EMBEDS_FLAG = 1 << 2;

/** Whether someone may remove previews: the author, or a moderator. */
export function canSuppressEmbeds(input: { isAuthor: boolean; canManageMessages: boolean }): boolean {
  return input.isAuthor || input.canManageMessages;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

/** Truncates a text preview to its first lines; reports whether anything was cut. */
export function previewLines(text: string, maxLines = TEXT_PREVIEW_LINES): { shown: string; truncated: boolean } {
  const lines = text.split(/\r?\n/);
  if (lines.length <= maxLines) return { shown: text, truncated: false };
  return { shown: lines.slice(0, maxLines).join('\n'), truncated: true };
}
