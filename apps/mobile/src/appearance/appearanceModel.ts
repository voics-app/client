import type { AccentId } from '@discordy/core/application/stores/prefsStore';
import { effectiveTheme } from '@discordy/core/domain/appearance';
import type { ThemeId } from '@discordy/core/domain/prefsTypes';

export interface AppearanceChoice {
  theme: ThemeId;
  accent: AccentId;
  syncOsTheme: boolean;
}

/** Whether the choice differs from what is on screen. Styles read the palette once, so such a choice shows from the next start of the app. */
export function needsRestart(applied: { theme: ThemeId; accent: AccentId }, choice: AppearanceChoice, osScheme: 'light' | 'dark' | null | undefined): boolean {
  const wanted = effectiveTheme(choice.theme, choice.syncOsTheme, osScheme !== 'light');
  return wanted !== applied.theme || choice.accent !== applied.accent;
}
