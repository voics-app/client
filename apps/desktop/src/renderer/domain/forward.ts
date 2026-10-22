import { ChannelType, MessageFlag, type Channel, type DeliveryMode, type Guild, type Message, type MessageSnapshot } from '@shared/contracts/rest';
import { Permission } from '@shared/contracts/permissions';
import { visibleDms, type ClosedDms } from './dmModel';
import { hasPermission } from './permissions';

export const FORWARD_REFERENCE_TYPE = 1;
export const FORWARD_REASON_PRIVATE = 'End-to-end encrypted chats cannot receive forwarded messages';
export const FORWARD_MENU_HINT = 'Messages in end-to-end encrypted chats are never forwarded through the server';
const MAX_RESULTS = 60;

export function isForward(message: Pick<Message, 'message_reference'>): boolean {
  return message.message_reference?.type === FORWARD_REFERENCE_TYPE;
}

/** The frozen copy a forwarded message carries, when it has one. */
export function forwardSnapshot(message: Pick<Message, 'message_reference' | 'message_snapshots'>): MessageSnapshot['message'] | null {
  return isForward(message) ? (message.message_snapshots?.[0]?.message ?? null) : null;
}

/** Whether a message can be forwarded: stored on the server and neither a system nor an ephemeral one. */
export function canForward(message: Pick<Message, 'type' | 'flags'>, mode: DeliveryMode | undefined): boolean {
  return (mode ?? 'standard') === 'standard' && (message.type === 0 || message.type === 19) && ((message.flags ?? 0) & MessageFlag.EPHEMERAL) === 0;
}

/** Body of the POST that forwards `message` into another channel. `comment` is the optional added text. */
export function forwardBody(message: Pick<Message, 'id' | 'channel_id' | 'guild_id'>, comment: string, nonce: string) {
  return {
    content: comment.trim(),
    nonce,
    message_reference: {
      type: FORWARD_REFERENCE_TYPE,
      message_id: message.id,
      channel_id: message.channel_id,
      ...(message.guild_id ? { guild_id: message.guild_id } : {}),
    },
  };
}

export interface ForwardTarget {
  id: string;
  kind: 'dm' | 'group' | 'channel';
  label: string;
  /** Server name for channels. */
  context?: string;
  /** Set when the chat cannot receive the forward; the row is shown disabled. */
  disabledReason?: string;
}

export interface ForwardSources {
  channels: Record<string, Channel>;
  guilds: Record<string, Pick<Guild, 'name'>>;
  closed: ClosedDms;
  query: string;
  /** Whether the forwarded message has files (needs ATTACH_FILES in the target). */
  hasAttachments: boolean;
  dmName: (channel: Channel) => string;
  modeOf: (channel: Channel) => DeliveryMode;
  permissionsOf: (channel: Channel) => bigint;
}

/** Recent DMs and group DMs first, then the text channels the user can send in; filtered by the search text. */
export function forwardTargets(src: ForwardSources): ForwardTarget[] {
  const q = src.query.trim().toLowerCase();
  const out: ForwardTarget[] = [];
  for (const c of visibleDms(src.channels, src.closed)) {
    const label = src.dmName(c);
    if (q && !label.toLowerCase().includes(q)) continue;
    out.push({ id: c.id, kind: c.type === ChannelType.GROUP_DM ? 'group' : 'dm', label, ...(src.modeOf(c) === 'standard' ? {} : { disabledReason: FORWARD_REASON_PRIVATE }) });
  }
  const text = Object.values(src.channels)
    .filter((c) => c.guild_id && (c.type === ChannelType.GUILD_TEXT || c.type === ChannelType.GUILD_ANNOUNCEMENT))
    .map((c) => ({ c, context: src.guilds[c.guild_id!]?.name ?? '' }))
    .filter(({ c, context }) => !q || (c.name ?? '').toLowerCase().includes(q) || context.toLowerCase().includes(q))
    .filter(({ c }) => {
      const p = src.permissionsOf(c);
      return hasPermission(p, Permission.VIEW_CHANNEL) && hasPermission(p, Permission.SEND_MESSAGES) && (!src.hasAttachments || hasPermission(p, Permission.ATTACH_FILES));
    })
    .sort((a, b) => a.context.localeCompare(b.context) || (a.c.position ?? 0) - (b.c.position ?? 0));
  for (const { c, context } of text) out.push({ id: c.id, kind: 'channel', label: c.name ?? 'channel', context });
  return out.slice(0, MAX_RESULTS);
}
