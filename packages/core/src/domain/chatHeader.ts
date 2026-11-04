/** Pure rules for the chat header: topic editing, pin actions and which header buttons exist. */
import { Permission } from '../contracts/permissions';
import { ChannelType, type Channel } from '../contracts/rest';

export const TOPIC_MAX_LENGTH = 1024;

const has = (perms: bigint, bit: bigint): boolean => (perms & bit) === bit;

/** Guild channels need MANAGE_CHANNELS; DM topics do not exist. */
export function canEditTopic(channel: Pick<Channel, 'type' | 'guild_id'>, perms: bigint): boolean {
  if (channel.type === ChannelType.DM || channel.type === ChannelType.GROUP_DM) return false;
  return Boolean(channel.guild_id) && has(perms, Permission.MANAGE_CHANNELS);
}

/** Trims the draft; empty clears the topic (`null`), too long is rejected (`undefined`). */
export function normalizeTopic(draft: string): string | null | undefined {
  const text = draft.trim();
  if (text.length > TOPIC_MAX_LENGTH) return undefined;
  return text === '' ? null : text;
}

/** Unpinning needs MANAGE_MESSAGES in a server; in a DM any participant may unpin. */
export function canUnpin(channel: Pick<Channel, 'type' | 'guild_id'>, perms: bigint): boolean {
  if (!channel.guild_id) return true;
  return has(perms, Permission.MANAGE_MESSAGES);
}

export interface HeaderButtons {
  call: boolean;
  videoCall: boolean;
  addFriends: boolean;
  profile: boolean;
  members: boolean;
  /** Threads need the list route (api#34): hidden until the client has it. */
  threads: boolean;
}

export const THREADS_LIST_AVAILABLE = false;

export function headerButtons(channel: Pick<Channel, 'type' | 'recipients'>): HeaderButtons {
  const dm = channel.type === ChannelType.DM;
  const group = channel.type === ChannelType.GROUP_DM;
  return {
    call: dm || group,
    videoCall: dm || group,
    addFriends: dm || group,
    profile: dm && (channel.recipients?.length ?? 0) === 1,
    members: !dm && !group,
    threads: THREADS_LIST_AVAILABLE && !dm && !group,
  };
}
