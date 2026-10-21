import { describe, expect, it } from 'vitest';
import {
  canSuppressEmbeds,
  clampPan,
  clampZoom,
  displayFilename,
  embedMediaSrc,
  embedPlayback,
  gridLayout,
  isBareMediaEmbed,
  isPlayerIframeUrl,
  isSpoiler,
  previewKind,
  previewLines,
  splitAttachments,
  stepIndex,
  withSpoilerPrefix,
  withoutSpoilerPrefix,
} from '@renderer/domain/media';
import type { Attachment } from '@shared/contracts/rest';

const file = (filename: string, content_type?: string, size = 100): Attachment => ({ id: filename, filename, content_type, size, url: `http://cdn/${filename}` });

describe('spoilers', () => {
  it('come from the flag or the SPOILER_ prefix', () => {
    expect(isSpoiler({ filename: 'a.png', flags: 8 })).toBe(true);
    expect(isSpoiler({ filename: 'SPOILER_a.png' })).toBe(true);
    expect(isSpoiler({ filename: 'a.png', flags: 0 })).toBe(false);
    expect(isSpoiler({ filename: 'my_SPOILER_a.png' })).toBe(false);
  });

  it('prefix helpers are idempotent and hide the prefix in the label', () => {
    expect(withSpoilerPrefix('a.png')).toBe('SPOILER_a.png');
    expect(withSpoilerPrefix('SPOILER_a.png')).toBe('SPOILER_a.png');
    expect(withoutSpoilerPrefix('SPOILER_a.png')).toBe('a.png');
    expect(displayFilename('SPOILER_a.png')).toBe('a.png');
    expect(displayFilename('SPOILER_')).toBe('SPOILER_');
  });
});

describe('previewKind', () => {
  it('classifies by media type, then by extension', () => {
    expect(previewKind(file('a.png', 'image/png'))).toBe('image');
    expect(previewKind(file('a.mp4', 'video/mp4'))).toBe('video');
    expect(previewKind(file('a.ogg', 'audio/ogg'))).toBe('audio');
    expect(previewKind(file('a.pdf', 'application/octet-stream'))).toBe('pdf');
    expect(previewKind(file('main.rs', 'application/octet-stream'))).toBe('text');
    expect(previewKind(file('notes', 'text/plain'))).toBe('text');
    expect(previewKind(file('data.bin', 'application/octet-stream'))).toBe('file');
  });

  it('does not preview empty or very large text files', () => {
    expect(previewKind(file('big.log', 'text/plain', 300 * 1024))).toBe('file');
    expect(previewKind(file('empty.txt', 'text/plain', 0))).toBe('file');
  });

  it('splits media from other files in order', () => {
    const { media, files } = splitAttachments([file('a.png', 'image/png'), file('b.pdf', 'application/pdf'), file('c.mp4', 'video/mp4')]);
    expect(media.map((m) => m.filename)).toEqual(['a.png', 'c.mp4']);
    expect(files.map((m) => m.filename)).toEqual(['b.pdf']);
  });
});

describe('gridLayout', () => {
  it('fills every cell exactly once for 1 to 10 items', () => {
    for (let n = 1; n <= 10; n += 1) {
      const layout = gridLayout(n);
      expect(layout.cells).toHaveLength(n);
      const covered = new Set<string>();
      for (const c of layout.cells) {
        for (let col = c.colStart; col < c.colStart + c.colSpan; col += 1) {
          for (let row = c.rowStart; row < c.rowStart + c.rowSpan; row += 1) {
            const key = `${col}:${row}`;
            expect(covered.has(key), `${n}: ${key} used twice`).toBe(false);
            covered.add(key);
          }
        }
      }
      expect(covered.size).toBe(6 * layout.rows);
    }
  });

  it('matches Discord for 1, 2, 3 and 4 images', () => {
    expect(gridLayout(1).cells).toEqual([{ colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 1 }]);
    expect(gridLayout(2).cells.map((c) => c.colSpan)).toEqual([3, 3]);
    expect(gridLayout(3).cells[0]).toEqual({ colStart: 1, colSpan: 3, rowStart: 1, rowSpan: 2 });
    expect(gridLayout(4).rows).toBe(2);
  });

  it('clamps out-of-range counts', () => {
    expect(gridLayout(0).cells).toHaveLength(1);
    expect(gridLayout(25).cells).toHaveLength(10);
  });
});

describe('lightbox math', () => {
  it('steps around the ring in both directions', () => {
    expect(stepIndex(0, 3, 1)).toBe(1);
    expect(stepIndex(2, 3, 1)).toBe(0);
    expect(stepIndex(0, 3, -1)).toBe(2);
    expect(stepIndex(0, 0, 1)).toBe(0);
  });

  it('clamps zoom and keeps the pan inside the overflow', () => {
    expect(clampZoom(0.2)).toBe(1);
    expect(clampZoom(100)).toBe(8);
    expect(clampPan(500, 400, 1)).toBe(0);
    expect(clampPan(500, 400, 2)).toBe(200);
    expect(clampPan(-500, 400, 2)).toBe(-200);
    expect(clampPan(50, 400, 2)).toBe(50);
  });
});

describe('embeds', () => {
  it('only the signed proxy URL is ever loaded', () => {
    expect(embedMediaSrc({ url: 'https://evil.example/a.png' })).toBeNull();
    expect(embedMediaSrc({ url: 'https://evil.example/a.png', proxy_url: 'http://cdn/external/x' })).toBe('http://cdn/external/x');
    expect(embedMediaSrc(undefined)).toBeNull();
  });

  it('plays allow-listed players in an iframe and other video through the proxy', () => {
    expect(embedPlayback({ video: { url: 'https://www.youtube.com/embed/abc' } })).toEqual({ kind: 'iframe', src: 'https://www.youtube.com/embed/abc' });
    expect(embedPlayback({ video: { url: 'https://cdn.example/a.mp4', proxy_url: 'http://cdn/external/v' } })).toEqual({ kind: 'file', src: 'http://cdn/external/v' });
    expect(embedPlayback({ video: { url: 'https://cdn.example/a.mp4' } })).toBeNull();
    expect(embedPlayback({ video: { url: 'https://evil.example/player', proxy_url: undefined } })).toBeNull();
    expect(embedPlayback({})).toBeNull();
  });

  it('refuses look-alike and insecure player hosts', () => {
    expect(isPlayerIframeUrl('https://www.youtube.com.evil.example/embed/a')).toBe(false);
    expect(isPlayerIframeUrl('http://www.youtube.com/embed/a')).toBe(false);
    expect(isPlayerIframeUrl('javascript:alert(1)')).toBe(false);
    expect(isPlayerIframeUrl('not a url')).toBe(false);
  });

  it('shows image embeds without a card only when they carry nothing else', () => {
    expect(isBareMediaEmbed({ type: 'image' })).toBe(true);
    expect(isBareMediaEmbed({ type: 'image', title: 't' })).toBe(false);
    expect(isBareMediaEmbed({ type: 'link' })).toBe(false);
  });

  it('lets the author and moderators remove previews', () => {
    expect(canSuppressEmbeds({ isAuthor: true, canManageMessages: false })).toBe(true);
    expect(canSuppressEmbeds({ isAuthor: false, canManageMessages: true })).toBe(true);
    expect(canSuppressEmbeds({ isAuthor: false, canManageMessages: false })).toBe(false);
  });
});

describe('previewLines', () => {
  it('cuts long text and reports it', () => {
    const text = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n');
    const { shown, truncated } = previewLines(text, 5);
    expect(truncated).toBe(true);
    expect(shown.split('\n')).toHaveLength(5);
    expect(previewLines('short', 5)).toEqual({ shown: 'short', truncated: false });
  });
});
