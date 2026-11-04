import type { Channel } from '@discordy/core/contracts/rest';
import { isPrivateChannel } from '@discordy/core/domain/channelActivity';
import { channelIcon, isVoiceKind } from '@discordy/core/domain/channelKind';
import { channelCapacity, type Capacity } from '@discordy/core/domain/voiceOccupant';

/** Ionicons names used by channel rows and screens. */
export type ChannelGlyph = 'volume-high' | 'megaphone-outline' | 'chatbubbles-outline';

export interface ChannelRowView {
  /** An icon, or null for the `#` of a text channel. */
  glyph: ChannelGlyph | null;
  voice: boolean;
  /** Hidden from @everyone. */
  private: boolean;
  /** End-to-end encrypted ephemeral delivery: shown with the lock. */
  ephemeral: boolean;
  p2p: boolean;
  nsfw: boolean;
  capacity: Capacity | null;
  /** Accessibility label of the row. */
  label: string;
}

const GLYPHS: Record<string, ChannelGlyph | null> = { voice: 'volume-high', stage: 'volume-high', announcement: 'megaphone-outline', forum: 'chatbubbles-outline', text: null, thread: null };

/** How one channel row looks, from the same kind, privacy and capacity rules the desktop sidebar uses. */
export function channelRowView(channel: Channel, occupants: number, canMoveMembers: boolean): ChannelRowView {
  const kind = channelIcon(channel.type);
  const voice = isVoiceKind(kind);
  const capacity = voice ? channelCapacity(channel.user_limit, occupants, canMoveMembers) : null;
  return {
    glyph: GLYPHS[kind] ?? null,
    voice,
    private: isPrivateChannel(channel),
    ephemeral: channel.delivery_mode === 'ephemeral',
    p2p: channel.delivery_mode === 'p2p',
    nsfw: Boolean(channel.nsfw),
    capacity: capacity?.label ? capacity : null,
    label: voice ? `Open voice channel ${channel.name}` : `Open #${channel.name}`,
  };
}
