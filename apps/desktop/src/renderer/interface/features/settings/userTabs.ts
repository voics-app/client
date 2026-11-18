import type { UserSettingsTab } from '@discordy/core/application/stores/uiStore';
import type { I18n, MessageId } from '@discordy/core/domain/i18n';

export const USER_TABS: { id: UserSettingsTab; label: string; group: string }[] = [
  { id: 'account', label: 'My account', group: 'User settings' },
  { id: 'profile', label: 'Profile', group: 'User settings' },
  { id: 'privacy', label: 'Privacy and delivery', group: 'User settings' },
  { id: 'devices', label: 'Devices', group: 'User settings' },
  { id: 'voice', label: 'Voice and video', group: 'App settings' },
  { id: 'keybinds', label: 'Keybinds', group: 'App settings' },
  { id: 'appearance', label: 'Appearance', group: 'App settings' },
  { id: 'accessibility', label: 'Accessibility', group: 'App settings' },
  { id: 'language', label: 'Language', group: 'App settings' },
  { id: 'notifications', label: 'Notifications', group: 'App settings' },
  { id: 'chat', label: 'Chat', group: 'App settings' },
  { id: 'connection', label: 'Connection', group: 'App settings' },
  { id: 'desktop', label: 'Desktop', group: 'App settings' },
  { id: 'advanced', label: 'Advanced', group: 'App settings' },
  { id: 'developer', label: 'Developer', group: 'App settings' },
  { id: 'about', label: 'About and updates', group: 'App settings' },
];

const LABELS: Partial<Record<UserSettingsTab, MessageId>> = {
  account: 'settings.account', profile: 'settings.profile', privacy: 'settings.privacy', devices: 'settings.devices',
  voice: 'settings.voice', keybinds: 'settings.keybinds', appearance: 'settings.appearance', accessibility: 'settings.accessibility',
  language: 'settings.language', notifications: 'settings.notifications', chat: 'settings.chat', connection: 'settings.connection',
  desktop: 'settings.desktop', advanced: 'settings.advanced', developer: 'settings.developer', about: 'settings.about',
};

export function translatedUserTabs({ t }: I18n) {
  return USER_TABS.map((tab) => ({ ...tab, label: LABELS[tab.id] ? t(LABELS[tab.id]!) : tab.label, group: t(tab.group === 'User settings' ? 'settings.user' : 'settings.app') }));
}
