import type { Ionicons } from '@expo/vector-icons';
import type { Channel } from '@discordy/core/contracts/rest';
import type { ReadStates } from '../shell/railModel';
import type { GuildMeta } from '@discordy/core/application/stores/guildStore';
import type { GuildNotificationSettings } from '@discordy/core/contracts/rest';
import { isChannelMutedDeep, scopeKey } from '@discordy/core/domain/notificationSettings';
import { channelSwitcherItem, isSwitchable, type SwitcherItem } from '@discordy/core/domain/quickSwitcher';
import { isUnread } from '@discordy/core/domain/unread';

export type SwitcherTarget =
  | { kind: 'chat'; guildId: string | null; channelId: string }
  | { kind: 'guild'; guildId: string }
  | { kind: 'route'; path: '/friends' | '/dms/new' | '/notifications' | '/discover' | '/settings' };

export interface MobileSwitcherItem extends SwitcherItem {
  /** Section heading the row sits under. */
  group: string;
  /** An Ionicons glyph, or null for the `#` of a text channel. */
  glyph: keyof typeof Ionicons.glyphMap | null;
  target: SwitcherTarget;
}

export interface SwitcherInput {
  channels: Record<string, Channel>;
  guilds: Record<string, Pick<GuildMeta, 'id' | 'name'>>;
  reads: ReadStates;
  settingsByScope: Record<string, GuildNotificationSettings | undefined>;
  /** Most recently visited channel ids, newest first (core `recentChannelIds`). */
  recents: readonly string[];
  /** A direct or group conversation's title. */
  dmName(channel: Channel): string;
  now: number;
}

const ACTIONS: readonly { id: string; label: string; keywords: string; glyph: NonNullable<MobileSwitcherItem['glyph']>; path: Extract<SwitcherTarget, { kind: 'route' }>['path'] }[] = [
  { id: 'friends', label: 'Friends', keywords: 'people requests', glyph: 'people-outline', path: '/friends' },
  { id: 'newdm', label: 'New message', keywords: 'dm direct group', glyph: 'create-outline', path: '/dms/new' },
  { id: 'inbox', label: 'Notifications', keywords: 'mentions inbox', glyph: 'notifications-outline', path: '/notifications' },
  { id: 'discover', label: 'Discover servers', keywords: 'find join', glyph: 'compass-outline', path: '/discover' },
  { id: 'settings', label: 'User settings', keywords: 'account profile appearance', glyph: 'settings-outline', path: '/settings' },
];

/** Everything the quick switcher can jump to: every channel and conversation, every server, and a few screens, with the same ids, kinds and unread facts as desktop's palette. */
export function switcherItems({ channels, guilds, reads, settingsByScope, recents, dmName, now }: SwitcherInput): MobileSwitcherItem[] {
  const chats = Object.values(channels)
    .filter(isSwitchable)
    .map<MobileSwitcherItem>((c) => {
      const dm = !c.guild_id;
      const read = reads[c.id];
      const item = channelSwitcherItem(c, {
        name: dm ? dmName(c) : (c.name ?? ''),
        guildName: c.guild_id ? guilds[c.guild_id]?.name : undefined,
        unread: !isChannelMutedDeep(settingsByScope[scopeKey(c.guild_id)], c, now) && isUnread(c.last_message_id, read?.lastReadId),
        mentions: read?.mentionCount ?? 0,
        recent: recents.indexOf(c.id),
      });
      return {
        ...item,
        group: dm ? 'Direct messages' : 'Channels',
        glyph: dm ? 'person-outline' : item.kind === 'voice' ? 'volume-high' : null,
        target: { kind: 'chat', guildId: c.guild_id ?? null, channelId: c.id },
      };
    });
  const servers = Object.values(guilds).map<MobileSwitcherItem>((g) => ({
    id: `g-${g.id}`,
    kind: 'guild',
    group: 'Servers',
    label: g.name,
    glyph: 'home-outline',
    target: { kind: 'guild', guildId: g.id },
  }));
  const actions = ACTIONS.map<MobileSwitcherItem>((a) => ({ id: `a-${a.id}`, kind: 'action', group: 'Go to', label: a.label, keywords: a.keywords, glyph: a.glyph, target: { kind: 'route', path: a.path } }));
  return [...chats, ...servers, ...actions];
}
