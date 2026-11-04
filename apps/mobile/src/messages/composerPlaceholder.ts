import { ChannelType, type Channel, type Relationship } from '@discordy/core/contracts/rest';
import { personName } from '../dms/dmModel';

/** The composer's hint, as desktop words it: `Message #general`, `Message @bob`, or `Message group` for a group conversation. */
export function composerPlaceholder(channel: Channel | undefined, relationships: Record<string, Relationship>): string {
  if (!channel) return 'Message';
  if (channel.guild_id) return `Message #${channel.name}`;
  const recipients = channel.recipients ?? [];
  if (channel.type === ChannelType.DM && recipients.length === 1) return `Message @${personName(recipients[0]!, relationships)}`;
  return 'Message group';
}
