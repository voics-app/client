import { ChannelType, type Channel } from '@shared/contracts/rest';
import { timestampOf } from './snowflake';
import { item, sep, tidy, type MenuModel } from './menuModel';
import { MUTE_DURATIONS } from './mute';

/** channelId -> last_message_id at the moment the DM was closed (empty string when it had none). */
export type ClosedDms = Record<string, string>;

export const MAX_GROUP_DM_MEMBERS = 10;

export function isPrivateConversation(c: Channel): boolean {
  return !c.guild_id && (c.type === ChannelType.DM || c.type === ChannelType.GROUP_DM);
}

/** A closed DM stays hidden until a message newer than the one it was closed at arrives. */
export function isClosed(closed: ClosedDms, c: Pick<Channel, 'id' | 'last_message_id'>): boolean {
  const at = closed[c.id];
  if (at === undefined) return false;
  const last = c.last_message_id ?? '';
  return last === at || (last !== '' && at !== '' && timestampOf(last) <= timestampOf(at));
}

/** Open conversations, most recent activity first. */
export function visibleDms(channels: Record<string, Channel>, closed: ClosedDms): Channel[] {
  const activity = (c: Channel) => (c.last_message_id ? timestampOf(c.last_message_id) : timestampOf(c.id));
  return Object.values(channels)
    .filter((c) => isPrivateConversation(c) && !isClosed(closed, c))
    .sort((a, b) => activity(b) - activity(a));
}

export interface DmMenuContext {
  group: boolean;
  hasUnread: boolean;
  muted: boolean;
  /** The other person of a 1:1 DM, for the Profile entry. */
  hasPeer: boolean;
}

export function buildDmMenu(ctx: DmMenuContext): MenuModel[] {
  const mute: MenuModel = ctx.muted
    ? item('unmute', 'Unmute Conversation')
    : { kind: 'submenu', id: 'mute', label: 'Mute Conversation', items: MUTE_DURATIONS.map((d) => item('muteFor', d.label, { arg: d.id })) };
  return tidy([
    item('markRead', 'Mark As Read', { disabled: !ctx.hasUnread }),
    ...(ctx.hasPeer ? [item('profile', 'Profile')] : []),
    ...(ctx.group ? [item('settings', 'Group Settings')] : []),
    mute,
    sep(),
    item('close', 'Close DM'),
    ...(ctx.group ? [item('leave', 'Leave Group', { danger: true })] : []),
  ]);
}

/** Inline text of a group DM system message (types 1, 2, 4, 5), or null for other types. */
export function systemMessageText(type: number, author: string, target: string | null, content: string): string | null {
  switch (type) {
    case 1: return `${author} added ${target ?? 'someone'} to the group.`;
    case 2: return target && target === author ? `${author} left the group.` : `${author} removed ${target ?? 'someone'} from the group.`;
    case 4: return `${author} changed the group name${content ? ` to ${content}` : ''}.`;
    case 5: return `${author} changed the group icon.`;
    default: return null;
  }
}
