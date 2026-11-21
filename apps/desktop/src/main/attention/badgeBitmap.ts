/**
 * Pure BGRA bitmap drawing for the Windows taskbar overlay and the tray state dot. Electron's
 * `nativeImage.createFromBitmap` takes BGRA on little-endian machines; no canvas is needed in main.
 */

export interface Bitmap {
  width: number;
  height: number;
  /** BGRA, 4 bytes per pixel. */
  data: Buffer;
}

export type Rgb = readonly [number, number, number];
export const RED: Rgb = [0xed, 0x42, 0x45];
export const WHITE: Rgb = [0xff, 0xff, 0xff];
export const UNREAD_DOT: Rgb = [0xf2, 0xf3, 0xf5];
const TRAY_UNREAD: Rgb = [0x80, 0x84, 0x8e];

// 3x5 glyphs, one string per row.
const GLYPHS: Record<string, readonly string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '+': ['000', '010', '111', '010', '000'],
};

export function createBitmap(width: number, height: number): Bitmap {
  return { width, height, data: Buffer.alloc(width * height * 4) };
}

export function setPixel(bmp: Bitmap, x: number, y: number, [r, g, b]: Rgb, alpha = 255): void {
  if (x < 0 || y < 0 || x >= bmp.width || y >= bmp.height) return;
  const i = (y * bmp.width + x) * 4;
  bmp.data[i] = b;
  bmp.data[i + 1] = g;
  bmp.data[i + 2] = r;
  bmp.data[i + 3] = alpha;
}

export function fillCircle(bmp: Bitmap, cx: number, cy: number, radius: number, color: Rgb): void {
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= radius - 0.5) setPixel(bmp, x, y, color);
      else if (d < radius + 0.5) setPixel(bmp, x, y, color, Math.round(255 * (radius + 0.5 - d)));
    }
  }
}

/** Overlay text for a mention count: 1..9 as digits, then 9+. */
export function overlayLabel(mentions: number): string {
  if (mentions <= 0) return '';
  if (mentions > 9) return '9+';
  return String(Math.floor(mentions));
}

function drawLabel(bmp: Bitmap, label: string, color: Rgb): void {
  const scale = label.length > 1 ? 4 : 5;
  const gap = scale;
  const width = label.length * 3 * scale + (label.length - 1) * gap;
  const height = 5 * scale;
  const x0 = Math.round((bmp.width - width) / 2);
  const y0 = Math.round((bmp.height - height) / 2);
  [...label].forEach((ch, index) => {
    const glyph = GLYPHS[ch];
    if (!glyph) return;
    glyph.forEach((row, ry) =>
      [...row].forEach((on, rx) => {
        if (on !== '1') return;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) setPixel(bmp, x0 + index * (3 * scale + gap) + rx * scale + dx, y0 + ry * scale + dy, color);
        }
      }),
    );
  });
}

/** 32x32 overlay: red disc with the count (mentions) or a small light dot (unread only). Null clears the overlay. */
export function renderOverlay(mentions: number, unread: number): Bitmap | null {
  const bmp = createBitmap(32, 32);
  if (mentions > 0) {
    fillCircle(bmp, 16, 16, 15, RED);
    drawLabel(bmp, overlayLabel(mentions), WHITE);
    return bmp;
  }
  if (unread > 0) {
    fillCircle(bmp, 16, 16, 8, UNREAD_DOT);
    return bmp;
  }
  return null;
}

/** Copy of `base` with a state dot in the bottom-right corner: red for mentions, grey for unread. */
export function withStateDot(base: Bitmap, state: 'unread' | 'mentions'): Bitmap {
  const out: Bitmap = { width: base.width, height: base.height, data: Buffer.from(base.data) };
  const radius = Math.max(3, Math.round(base.width * 0.3));
  const cx = base.width - radius;
  const cy = base.height - radius;
  fillCircle(out, cx, cy, radius + 1, WHITE);
  fillCircle(out, cx, cy, radius, state === 'mentions' ? RED : TRAY_UNREAD);
  return out;
}
