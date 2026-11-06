import { paletteFor, type Palette } from './appearance/palettes';

/**
 * The colours of the app, desktop's Nightglass tokens. The object is shared and `applyPalette` rewrites it in place before any screen module is loaded
 * (see appearance/boot.ts), so a chosen theme or accent takes effect the next time the app starts; styles read it once, when their module loads.
 */
export const theme: Palette = paletteFor('dark', 'iris');

/** Replaces the colours in `theme`. Only boot calls it: styles that already read the old values would not change. */
export function applyPalette(palette: Palette): void {
  Object.assign(theme, palette);
}

/** Sizes from desktop's layout tokens and rail styles. */
export const metrics = {
  railWidth: 72,
  serverTile: 48,
  serverRadius: 18,
  serverRadiusActive: 14,
  columnRadius: 16,
  headerHeight: 48,
  channelRowHeight: 44,
  panelRadius: 14,
} as const;

/** Desktop's type scale (`--fs-*`), in points. Screens pick a rung from here instead of writing a size. */
export const type = { caption: 11, meta: 12, small: 13, ui: 14, body: 15, title: 17, section: 20, page: 24, hero: 30 } as const;

/** Desktop's spacing scale (`--space-1` to `--space-8`). */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64 } as const;

/** Desktop's radii: chip 6, control 10, panel 14, dialog 20. */
export const radius = { chip: 6, control: 10, panel: 14, dialog: 20, full: 999 } as const;

/** Apple's minimum touch target, in points. */
export const HIT = 44;

/** Text in fixed-height chrome (rows, headers, chips) grows with Dynamic Type up to this factor, so it stays inside its box; message text and settings copy grow freely. */
export const CHROME_FONT_CAP = 1.3;
