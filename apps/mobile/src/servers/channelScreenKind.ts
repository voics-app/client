import type { Channel } from '@discordy/core/contracts/rest';
import { channelIcon, isVoiceKind } from '@discordy/core/domain/channelKind';

export type ChannelScreenKind =
  | { screen: 'chat' }
  | { screen: 'voice' }
  /** A channel this version cannot show; `message` says why in plain words. */
  | { screen: 'unsupported'; message: string };

export const EPHEMERAL_MESSAGE = "Ephemeral channels are end-to-end encrypted. They aren't in this test version yet.";
export const P2P_MESSAGE = "Peer-to-peer channels are end-to-end encrypted. They aren't in this test version yet.";
export const FORUM_MESSAGE = "Forum channels aren't in this test version yet.";

/** Which screen opens a tapped server channel. Unknown channels fall through to chat, which says it is not available. */
export function channelScreenKind(channel: Channel | undefined): ChannelScreenKind {
  if (!channel) return { screen: 'chat' };
  const kind = channelIcon(channel.type);
  if (isVoiceKind(kind)) return { screen: 'voice' };
  if (kind === 'forum') return { screen: 'unsupported', message: FORUM_MESSAGE };
  if (channel.delivery_mode === 'ephemeral') return { screen: 'unsupported', message: EPHEMERAL_MESSAGE };
  if (channel.delivery_mode === 'p2p') return { screen: 'unsupported', message: P2P_MESSAGE };
  return { screen: 'chat' };
}
