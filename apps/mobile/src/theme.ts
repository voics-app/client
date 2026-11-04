/** Desktop's Nightglass dark tokens (apps/desktop .../shared/theme/tokens.css, OKLCH hue 275) converted to sRGB hex. */
export const theme = {
  /** --bg-0: the shell, the server rail and the chat stage. */
  background: '#0c0d12',
  /** --bg-1: the channel column. */
  surface: '#13141b',
  /** --bg-2: raised panels such as the user panel and server tiles. */
  raised: '#1b1c25',
  /** --bg-3: hovered and pressed tiles. */
  raisedHover: '#252731',
  /** --fg */
  text: '#edeef4',
  /** --fg-muted */
  muted: '#adb0bd',
  /** --fg-subtle: idle channel names and category labels. */
  subtle: '#828593',
  /** --accent */
  accent: '#7d8dff',
  /** --accent-fg */
  accentText: '#fbfcff',
  /** --accent-soft: the active channel row (accent at 16%). */
  accentSoft: 'rgba(125, 141, 255, 0.16)',
  /** --hairline and --hairline-strong: fg at 8% and 14%. */
  hairline: 'rgba(237, 238, 244, 0.08)',
  hairlineStrong: 'rgba(237, 238, 244, 0.14)',
  /** --hover: fg at 6%. */
  hover: 'rgba(237, 238, 244, 0.06)',
  danger: '#fc5855',
  success: '#58cd78',
} as const;

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
