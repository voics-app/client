import { Permission } from '@discordy/core/contracts/permissions';
import { hasPermission } from '@discordy/core/domain/permissions';
import { serverSettingsTabs, type ServerSettingsTabId } from '@discordy/core/domain/serverSettings';

export type SettingsPageId = Extract<ServerSettingsTabId, 'overview' | 'roles' | 'emoji' | 'members' | 'invites' | 'bans' | 'audit'> | 'channels';

export interface SettingsPage {
  id: SettingsPageId;
  label: string;
  icon: 'information-circle-outline' | 'shield-outline' | 'people-outline' | 'link-outline' | 'chatbubbles-outline' | 'happy-outline' | 'ban-outline' | 'document-text-outline';
  hint: string;
}

const BUILT: Record<SettingsPageId, Omit<SettingsPage, 'id' | 'label'>> = {
  overview: { icon: 'information-circle-outline', hint: 'Name and icon' },
  roles: { icon: 'shield-outline', hint: 'Names, colours and permissions' },
  emoji: { icon: 'happy-outline', hint: 'Upload, rename and delete' },
  members: { icon: 'people-outline', hint: 'Roles, nickname, timeout, kick and ban' },
  invites: { icon: 'link-outline', hint: 'Create, copy and revoke' },
  bans: { icon: 'ban-outline', hint: 'See and lift bans' },
  audit: { icon: 'document-text-outline', hint: 'Moderation and settings changes' },
  channels: { icon: 'chatbubbles-outline', hint: 'Create, edit, reorder and permissions' },
};

/** The server settings pages the mobile app has, in the desktop's order, each only for a user the desktop would show it to. Channels needs Manage Channels, as desktop's channel settings do. */
export function settingsPages(perms: bigint): SettingsPage[] {
  const pages: SettingsPage[] = serverSettingsTabs(perms)
    .filter((t) => t.show && t.id in BUILT)
    .map((t) => ({ id: t.id as SettingsPageId, label: t.label, ...BUILT[t.id as SettingsPageId] }));
  if (hasPermission(perms, Permission.MANAGE_CHANNELS)) pages.push({ id: 'channels', label: 'Channels', ...BUILT.channels });
  return pages;
}
