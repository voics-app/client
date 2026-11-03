/**
 * Static index behind the settings search (client#89). Each entry names a tab and, for a row, the
 * row's title: `SettingRow` stamps `data-row` with `rowSlug(title)`, so search can scroll to it.
 * A new setting registers itself by adding one line here, next to its tab's other rows.
 */
import type { UserSettingsTab } from '@renderer/application/stores/uiStore';
import { rowSlug } from '@renderer/domain/rowSlug';
import { USER_TABS } from './userTabs';

export interface SettingEntry {
  tab: UserSettingsTab;
  /** The row's title as shown. */
  label: string;
  keywords?: string;
}

export interface SettingHit {
  tab: UserSettingsTab;
  tabLabel: string;
  label: string;
  /** Matches `data-row` on the row; null when the hit is the tab itself. */
  rowId: string | null;
}

export { rowSlug };

const row = (tab: UserSettingsTab, label: string, keywords = ''): SettingEntry => ({ tab, label, keywords });

const TAB_KEYWORDS: Record<UserSettingsTab, string> = {
  account: 'username email password security two-factor 2fa log out sign out delete',
  profile: 'display name avatar about me bio colour color banner',
  privacy: 'delivery mode encryption e2ee ephemeral p2p',
  devices: 'sessions fingerprint identity',
  voice: 'microphone camera input output audio video noise',
  keybinds: 'shortcuts hotkeys keyboard push to talk',
  appearance: 'theme dark light oled accent zoom density font',
  accessibility: 'motion contrast tts speech saturation gif',
  notifications: 'sounds desktop mentions badge flash',
  chat: 'messages images embeds spoilers emoji reactions enter send',
  connection: 'server api gateway cdn profile url',
  desktop: 'tray startup idle window launch',
  advanced: 'developer mode copy id debug',
  about: 'version update platform',
};

export const USER_SETTINGS_INDEX: SettingEntry[] = [
  row('account', 'Username'), row('account', 'Email'), row('account', 'Password'), row('account', 'Two-factor authentication', '2fa authenticator backup codes'),
  row('account', 'Disable account'), row('account', 'Delete account'), row('account', 'Log out', 'sign out logout'),
  row('privacy', 'Encrypt all my calls end-to-end', 'e2ee calls'),
  row('voice', 'Input mode', 'voice activity push to talk'), row('voice', 'Sensitivity', 'voice activity threshold'), row('voice', 'Push-to-talk key'), row('voice', 'Release delay'),
  row('voice', 'Noise suppression', 'rnnoise'), row('voice', 'Echo cancellation'), row('voice', 'Automatic gain control', 'agc'),
  row('appearance', 'Sync with computer', 'theme os system'), row('appearance', 'Message density', 'compact cozy'), row('appearance', 'Show avatars in compact'),
  row('appearance', 'Space between message groups', 'spacing'), row('appearance', 'Channel list density'), row('appearance', 'Text size', 'font scale'), row('appearance', 'Zoom', 'scale'),
  row('accessibility', 'Sync with computer', 'reduced motion os'), row('accessibility', 'Reduce motion', 'animation'), row('accessibility', 'Play GIFs automatically', 'animate'),
  row('accessibility', 'Animate emoji'), row('accessibility', 'Animate stickers'), row('accessibility', 'Saturation', 'colour color'), row('accessibility', 'Role colours', 'role colors'),
  row('accessibility', 'High contrast'), row('accessibility', 'Always underline links'), row('accessibility', 'Allow playback and use of /tts', 'text to speech'), row('accessibility', 'Speech rate'),
  row('notifications', 'Desktop notifications'), row('notifications', 'Only mentions'), row('notifications', 'Notification sounds'), row('notifications', 'Flash taskbar'),
  row('chat', 'Show link previews', 'url embed'), row('chat', 'Display images and videos', 'attachments inline media'), row('chat', 'Show embeds', 'rich cards'),
  row('chat', 'Show spoiler content', 'hidden reveal'), row('chat', 'Convert emoticons', 'smiley :)'), row('chat', 'Show reactions'),
  row('chat', 'Send with Ctrl+Enter', 'enter newline composer'), row('chat', 'Compact reply preview', 'quote'),
  row('connection', 'Profile', 'instance server'),
  row('desktop', 'Go idle automatically', 'away afk'),
  row('advanced', 'Developer mode', 'copy id debug'),
  row('about', 'Version'), row('about', 'Platform'), row('about', 'Update feed'),
];

/** Lower is better; null when a token matches nowhere. Every token of the query must match. */
function score(query: string, label: string, keywords: string): number | null {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const l = label.toLowerCase();
  const rest = keywords.toLowerCase();
  let total = 0;
  for (const t of tokens) {
    if (l.startsWith(t)) total += 0;
    else if (l.split(/[^a-z0-9]+/).some((w) => w.startsWith(t))) total += 1;
    else if (l.includes(t)) total += 2;
    else if (rest.includes(t)) total += 4;
    else return null;
  }
  return total;
}

/** Tabs and rows matching `query`, best first. An empty query yields nothing. */
export function searchSettings(query: string, entries: readonly SettingEntry[] = USER_SETTINGS_INDEX, limit = 12): SettingHit[] {
  const scored: { hit: SettingHit; s: number; order: number }[] = [];
  let order = 0;
  for (const tab of USER_TABS) {
    const tabScore = score(query, tab.label, TAB_KEYWORDS[tab.id]);
    // A tab edges out a row with the same score.
    if (tabScore !== null) scored.push({ hit: { tab: tab.id, tabLabel: tab.label, label: tab.label, rowId: null }, s: tabScore - 0.5, order: order++ });
    for (const e of entries) {
      if (e.tab !== tab.id) continue;
      const s = score(query, e.label, `${e.keywords ?? ''} ${tab.label}`);
      if (s !== null) scored.push({ hit: { tab: tab.id, tabLabel: tab.label, label: e.label, rowId: rowSlug(e.label) }, s, order: order++ });
    }
  }
  return scored.sort((a, b) => a.s - b.s || a.order - b.order).slice(0, limit).map((x) => x.hit);
}
