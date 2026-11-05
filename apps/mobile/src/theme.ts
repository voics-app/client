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
  channelRowHeight: 32,
  panelRadius: 14,
} as const;
