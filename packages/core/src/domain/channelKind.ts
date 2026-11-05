/** Which kind of row and screen a channel gets; shared by the desktop sidebar and the mobile channel list. */
import { ChannelType } from '../contracts/rest';

export type ChannelKind = 'text' | 'voice' | 'announcement' | 'forum' | 'stage' | 'thread';

export function channelIcon(type: number): ChannelKind {
  if (type === ChannelType.GUILD_VOICE) return 'voice';
  if (type === ChannelType.GUILD_STAGE_VOICE) return 'stage';
  if (type === ChannelType.GUILD_ANNOUNCEMENT) return 'announcement';
  if (type === ChannelType.GUILD_FORUM) return 'forum';
  if (type >= 10 && type <= 12) return 'thread';
  return 'text';
}

/** Voice and stage channels are joined, not read. */
export function isVoiceKind(kind: ChannelKind): boolean {
  return kind === 'voice' || kind === 'stage';
}
