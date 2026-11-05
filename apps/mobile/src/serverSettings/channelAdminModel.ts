import { ChannelType } from '@discordy/core/contracts/rest';

/** The kinds of channel the desktop create dialog offers (categories have their own button). */
export const CHANNEL_TYPE_OPTIONS = [
  { value: ChannelType.GUILD_TEXT, label: 'Text' },
  { value: ChannelType.GUILD_VOICE, label: 'Voice' },
  { value: ChannelType.GUILD_ANNOUNCEMENT, label: 'Announcement' },
  { value: ChannelType.GUILD_FORUM, label: 'Forum' },
] as const;

export const DELIVERY_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'ephemeral', label: 'Ephemeral E2EE' },
] as const;

export type DeliveryChoice = (typeof DELIVERY_OPTIONS)[number]['value'];

/** Channels are named in lower case with dashes; categories keep what was typed. */
export function normalizeChannelName(name: string, isCategory: boolean): string {
  return isCategory ? name.trim() : name.trim().toLowerCase().replace(/\s+/g, '-');
}

export interface NewChannelInput {
  name: string;
  type: number;
  parentId: string | null;
  delivery: DeliveryChoice;
}

/** The create request, built as the desktop dialog builds it: a category has no parent, only text channels may be ephemeral. */
export function createChannelBody({ name, type, parentId, delivery }: NewChannelInput) {
  const isCategory = type === ChannelType.GUILD_CATEGORY;
  return {
    name: normalizeChannelName(name, isCategory),
    type,
    parent_id: isCategory ? null : parentId,
    delivery_mode: type === ChannelType.GUILD_TEXT ? delivery : ('standard' as const),
  };
}
