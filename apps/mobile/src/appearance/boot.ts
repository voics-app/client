// Imported by the root layout right after ../install and before every screen module: persisted preferences are readable by then, and the
// styles of the screens load after the palette is in place.
import { Appearance } from 'react-native';
import { usePrefsStore, type AccentId } from '@discordy/core/application/stores/prefsStore';
import { effectiveTheme } from '@discordy/core/domain/appearance';
import type { ThemeId } from '@discordy/core/domain/prefsTypes';
import { applyPalette } from '../theme';
import { paletteFor } from './palettes';

const prefs = usePrefsStore.getState();
const theme: ThemeId = effectiveTheme(prefs.theme, prefs.syncOsTheme, Appearance.getColorScheme() !== 'light');
const accent: AccentId = prefs.accent;
applyPalette(paletteFor(theme, accent));

/** The theme and accent this run of the app is drawn with; a later choice in Appearance only shows from the next start. */
export const appliedAppearance = (): { theme: ThemeId; accent: AccentId } => ({ theme, accent });
