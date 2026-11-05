import type { AccentId } from '@discordy/core/application/stores/prefsStore';
import type { ThemeId } from '@discordy/core/domain/prefsTypes';

/** The colours every screen reads. Values are desktop's Nightglass tokens (apps/desktop .../shared/theme/tokens.css, OKLCH hue 275) as sRGB hex. */
export interface Palette {
  /** --bg-0: the shell, the server rail and the chat stage. */
  background: string;
  /** --bg-1: the channel column. */
  surface: string;
  /** --bg-2: raised panels such as the user panel and server tiles. */
  raised: string;
  /** --bg-3: hovered and pressed tiles. */
  raisedHover: string;
  /** --fg */
  text: string;
  /** --fg-muted */
  muted: string;
  /** --fg-subtle: idle channel names and category labels. */
  subtle: string;
  /** --accent */
  accent: string;
  /** --accent-fg */
  accentText: string;
  /** --accent-soft: the active channel row (accent at 16%). */
  accentSoft: string;
  /** --hairline and --hairline-strong: fg at 8% and 14%. */
  hairline: string;
  hairlineStrong: string;
  /** --hover: fg at 6%. */
  hover: string;
  danger: string;
  success: string;
}

type Base = Omit<Palette, 'accent' | 'accentText' | 'accentSoft' | 'hairline' | 'hairlineStrong' | 'hover'> & { fg: readonly [number, number, number] };

const DARK: Base = { background: '#0c0d12', surface: '#13141b', raised: '#1b1c25', raisedHover: '#252731', text: '#edeef4', muted: '#adb0bd', subtle: '#828593', danger: '#fc5855', success: '#58cd78', fg: [237, 238, 244] };
const OLED: Base = { ...DARK, background: '#000000', surface: '#06060a', raised: '#0e0f15', raisedHover: '#181a22' };
const LIGHT: Base = { background: '#eef0f6', surface: '#f5f6fb', raised: '#fbfcff', raisedHover: '#e7e9f0', text: '#171a26', muted: '#434758', subtle: '#5e6275', danger: '#cc272e', success: '#0a7e3a', fg: [23, 26, 38] };

const BASES: Record<ThemeId, Base> = { dark: DARK, oled: OLED, light: LIGHT };

/** Accent per theme: desktop uses lightness 0.7 on dark themes and 0.55 on light, with the same hue and chroma. */
const ACCENTS: Record<AccentId, { dark: string; light: string; onDark: string }> = {
  iris: { dark: '#7d8dff', light: '#555de3', onDark: '#fbfcff' },
  aurora: { dark: '#00ba99', light: '#008b6d', onDark: '#f8fdfb' },
  ember: { dark: '#f27636', light: '#bd4600', onDark: '#fffbf9' },
  rose: { dark: '#fe5c8e', light: '#c82462', onDark: '#fffafb' },
  citrine: { dark: '#b69f00', light: '#887100', onDark: '#fcfcf8' },
  sky: { dark: '#00acf3', light: '#007cc0', onDark: '#f9fcff' },
};

export const ACCENT_CHOICES: readonly { id: AccentId; label: string }[] = [
  { id: 'iris', label: 'Iris' },
  { id: 'aurora', label: 'Aurora' },
  { id: 'ember', label: 'Ember' },
  { id: 'rose', label: 'Rose' },
  { id: 'citrine', label: 'Citrine' },
  { id: 'sky', label: 'Sky' },
];

export const THEME_CHOICES: readonly { id: ThemeId; label: string }[] = [
  { id: 'dark', label: 'Dark' },
  { id: 'oled', label: 'OLED' },
  { id: 'light', label: 'Light' },
];

const rgba = ([r, g, b]: readonly [number, number, number], alpha: number) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The palette for a theme and accent. */
export function paletteFor(theme: ThemeId, accent: AccentId): Palette {
  const { fg, ...base } = BASES[theme];
  const pick = ACCENTS[accent] ?? ACCENTS.iris;
  const color = theme === 'light' ? pick.light : pick.dark;
  return { ...base, accent: color, accentText: pick.onDark, accentSoft: rgba(hexToRgb(color), 0.16), hairline: rgba(fg, 0.08), hairlineStrong: rgba(fg, 0.14), hover: rgba(fg, 0.06) };
}
