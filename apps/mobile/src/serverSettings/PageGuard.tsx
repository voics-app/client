import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useGuildPermissions } from '../servers/useGuildPermissions';
import { Notice } from '../ui/controls';
import { settingsPages, type SettingsPageId } from './settingsPages';

/** Shows a settings page only to someone the desktop would show it to; a deep link or a role change mid-way ends in a plain note, never in controls that would fail. */
export function PageGuard({ guildId, page, title, children }: { guildId: string; page: SettingsPageId; title: string; children: ReactNode }) {
  const exists = useGuildStore((s) => guildId in s.guilds);
  const perms = useGuildPermissions(guildId);
  const allowed = exists && settingsPages(perms).some((p) => p.id === page);
  return (
    <>
      <Stack.Screen options={{ title }} />
      {allowed ? children : <Notice>{exists ? "You don't have permission to use this page." : 'This server is not available.'}</Notice>}
    </>
  );
}
