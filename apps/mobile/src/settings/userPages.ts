import { searchSettingsIndex, type SettingsHit, type SettingsPageInfo, type SettingsRowInfo } from '@discordy/core/domain/settingsSearch';

export type UserPageId = 'account' | 'connections' | 'profile' | 'privacy' | 'devices' | 'appearance' | 'accessibility' | 'notifications' | 'chat';

export interface UserPage extends SettingsPageInfo<UserPageId> {
  group: 'User settings' | 'App settings';
  icon: 'person-circle-outline' | 'id-card-outline' | 'lock-closed-outline' | 'phone-portrait-outline' | 'color-palette-outline' | 'accessibility-outline' | 'notifications-outline' | 'chatbubble-outline';
  hint: string;
}

/**
 * The pages of desktop's user settings that mean something on a phone, in desktop's order and grouping. Left out on purpose: Voice and video (calls come with
 * the native build), Keybinds, Connection, Desktop, Advanced, Developer and About, which are desktop-only; desktop has no Language page either.
 */
export const USER_PAGES: readonly UserPage[] = [
  { id: 'account', label: 'My account', group: 'User settings', icon: 'person-circle-outline', hint: 'Username, email, password, two-factor, log out', keywords: 'username email password security two-factor 2fa authenticator backup codes log out sign out delete disable' },
  { id: 'connections', label: 'Connections', group: 'User settings', icon: 'id-card-outline', hint: 'Linked accounts and profile visibility', keywords: 'github linked accounts profile' },
  { id: 'profile', label: 'Profile', group: 'User settings', icon: 'id-card-outline', hint: 'Avatar, banner, about me, status', keywords: 'display name avatar picture banner about me bio colour color status custom status online idle do not disturb invisible' },
  { id: 'privacy', label: 'Privacy and delivery', group: 'User settings', icon: 'lock-closed-outline', hint: 'Delivery mode, blocked users', keywords: 'delivery mode encryption e2ee ephemeral p2p block blocked unblock' },
  { id: 'devices', label: 'Devices and sessions', group: 'User settings', icon: 'phone-portrait-outline', hint: 'Where you are logged in', keywords: 'devices sessions logged in log out other fingerprint identity' },
  { id: 'appearance', label: 'Appearance', group: 'App settings', icon: 'color-palette-outline', hint: 'Theme, accent, text size', keywords: 'theme dark light oled accent colour color text size font scale' },
  { id: 'accessibility', label: 'Accessibility', group: 'App settings', icon: 'accessibility-outline', hint: 'Motion, role colours, links', keywords: 'motion reduce animation role colours colors underline links' },
  { id: 'notifications', label: 'Notifications', group: 'App settings', icon: 'notifications-outline', hint: 'Push, banners and mentions', keywords: 'push banners mentions alerts do not disturb previews badge' },
  { id: 'chat', label: 'Chat', group: 'App settings', icon: 'chatbubble-outline', hint: 'Media, spoilers, reactions, emoticons', keywords: 'messages images videos media spoilers emoji reactions emoticons' },
];

const row = (page: UserPageId, label: string, keywords = ''): SettingsRowInfo<UserPageId> => ({ page, label, keywords });

/** Every row of every page, so search can find a setting by its title. A new setting registers itself by adding one line next to its page's other rows. */
export const USER_SETTING_ROWS: readonly SettingsRowInfo<UserPageId>[] = [
  row('account', 'Username'),
  row('account', 'Email'),
  row('account', 'Password'),
  row('account', 'Two-factor authentication', '2fa authenticator backup codes totp'),
  row('account', 'Disable account'),
  row('account', 'Delete account'),
  row('account', 'Log out', 'sign out logout'),
  row('profile', 'Avatar', 'picture photo'),
  row('profile', 'Banner'),
  row('profile', 'Display name'),
  row('profile', 'About me', 'bio'),
  row('profile', 'Profile colour', 'color accent'),
  row('profile', 'Status', 'online idle do not disturb invisible'),
  row('profile', 'Custom status', 'text emoji expires'),
  row('privacy', 'Default delivery mode', 'encryption e2ee ephemeral p2p standard'),
  row('privacy', 'Encrypt all my calls end-to-end', 'e2ee calls'),
  row('privacy', 'Per-chat overrides'),
  row('privacy', 'Blocked users', 'block unblock'),
  row('devices', 'Logged-in devices', 'sessions'),
  row('devices', 'Log out all known devices', 'sessions other'),
  row('devices', 'Encrypted-message devices', 'identity fingerprint'),
  row('appearance', 'Theme', 'dark oled light'),
  row('appearance', 'Accent', 'colour color'),
  row('appearance', 'Match iPhone appearance', 'sync system os light dark'),
  row('appearance', 'Text size', 'font scale'),
  row('accessibility', 'Reduce motion', 'animation'),
  row('accessibility', 'Match iPhone motion setting', 'sync system os'),
  row('accessibility', 'Role colours', 'role colors names'),
  row('accessibility', 'Always underline links'),
  row('notifications', 'Push notifications', 'push apns permission ios settings'),
  row('notifications', 'Show message previews', 'push preview text'),
  row('notifications', 'Only mentions', 'banners push'),
  row('chat', 'Display images and videos', 'attachments inline media'),
  row('chat', 'Show spoiler content', 'hidden reveal'),
  row('chat', 'Show reactions'),
  row('chat', 'Convert emoticons', 'smiley :)'),
];

export type UserSettingHit = SettingsHit<UserPageId>;

/** Pages and rows matching `query`, best first. */
export function searchUserSettings(query: string): UserSettingHit[] {
  return searchSettingsIndex(query, USER_PAGES, USER_SETTING_ROWS);
}

export const isUserPage = (id: string): id is UserPageId => USER_PAGES.some((p) => p.id === id);

export const pageLabel = (id: UserPageId): string => USER_PAGES.find((p) => p.id === id)!.label;
