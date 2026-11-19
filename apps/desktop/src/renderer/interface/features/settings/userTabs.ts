import type { UserSettingsTab } from '@discordy/core/application/stores/uiStore';

export const USER_TABS: { id: UserSettingsTab; label: string; group: string }[] = [
  { id: 'account', label: 'My account', group: 'User settings' },
  { id: 'profile', label: 'Profile', group: 'User settings' },
  { id: 'privacy', label: 'Privacy and delivery', group: 'User settings' },
  { id: 'devices', label: 'Devices', group: 'User settings' },
  { id: 'authorizedApps', label: 'Authorized apps', group: 'User settings' },
  { id: 'voice', label: 'Voice and video', group: 'App settings' },
  { id: 'keybinds', label: 'Keybinds', group: 'App settings' },
  { id: 'appearance', label: 'Appearance', group: 'App settings' },
  { id: 'accessibility', label: 'Accessibility', group: 'App settings' },
  { id: 'notifications', label: 'Notifications', group: 'App settings' },
  { id: 'chat', label: 'Chat', group: 'App settings' },
  { id: 'connection', label: 'Connection', group: 'App settings' },
  { id: 'desktop', label: 'Desktop', group: 'App settings' },
  { id: 'advanced', label: 'Advanced', group: 'App settings' },
  { id: 'developer', label: 'Developer', group: 'App settings' },
  { id: 'about', label: 'About and updates', group: 'App settings' },
];
