/** Pure rules behind the Appearance and Accessibility pages: effective theme and motion, UI zoom steps, role colours, TTS command. */
import type { ThemeId } from '@renderer/application/stores/prefsStore';

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
export const ZOOM_STEP = 0.1;
export type ZoomAction = 'in' | 'out' | 'reset';
export type RoleColorMode = 'name' | 'dot' | 'hidden';

export const clampZoom = (zoom: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom * 100) / 100));

export function stepZoom(zoom: number, action: ZoomAction): number {
  if (action === 'reset') return 1;
  return clampZoom(zoom + (action === 'in' ? ZOOM_STEP : -ZOOM_STEP));
}

/** Ctrl +, Ctrl =, Ctrl -, Ctrl 0 (also on the numpad). */
export function zoomActionOf(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>): ZoomAction | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  if (e.key === '+' || e.key === '=') return 'in';
  if (e.key === '-' || e.key === '_') return 'out';
  if (e.key === '0') return 'reset';
  return null;
}

/** With "sync with computer" on, the OS decides light or dark; for a dark OS the chosen dark variant (dark or OLED) is kept. */
export function effectiveTheme(theme: ThemeId, syncOs: boolean, osDark: boolean): ThemeId {
  if (!syncOs) return theme;
  if (!osDark) return 'light';
  return theme === 'light' ? 'dark' : theme;
}

/** The OS setting counts unless the person turned "sync with computer" off. */
export const effectiveReduceMotion = (reduceMotion: boolean, syncOs: boolean, osReduces: boolean): boolean => reduceMotion || (syncOs && osReduces);

export function roleColorStyle(color: string | undefined, mode: RoleColorMode): { tint?: string; dot?: string } {
  if (!color || mode === 'hidden') return {};
  return mode === 'dot' ? { dot: color } : { tint: color };
}

/** A message starting with `@silent ` is sent without notifications; returns the text without the prefix, or null when not silent. */
export function parseSilentPrefix(input: string): string | null {
  const m = /^@silent\s+([\s\S]*\S[\s\S]*)$/i.exec(input.trim());
  return m ? m[1]!.trim() : null;
}

/** `/tts message` sends a text-to-speech message; returns the text to send, or null when the input is not that command. */
export function parseTtsCommand(input: string): string | null {
  const m = /^\/tts(?:\s+([\s\S]*))?$/i.exec(input.trim());
  if (!m) return null;
  const text = (m[1] ?? '').trim();
  return text || null;
}
