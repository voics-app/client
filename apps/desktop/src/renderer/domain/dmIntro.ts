import { ChannelType, RelationshipType, type Channel, type Relationship, type User } from '@shared/contracts/rest';

export const WAVE_EMOJI = '\u{1F44B}';

/** A RELATIONSHIP_ADD that turns a request (either direction) or nothing into a friendship; repeats of an existing friendship do not count. */
export function becameFriends(previous: Relationship | undefined, next: Relationship): boolean {
  return next.type === RelationshipType.FRIEND && previous?.type !== RelationshipType.FRIEND;
}

export interface DmIntro {
  user: User;
  /** The user's own name; the intro states the `@username` separately. */
  name: string;
  username: string;
  text: string;
  /** Only an empty conversation offers the wave. */
  canWave: boolean;
}

/** The beginning-of-history header of a 1:1 DM, or null for any other channel. `nameOf` resolves the display name (nickname, global name, username). */
export function dmIntro(channel: Channel | undefined, empty: boolean, nameOf: (user: User) => string): DmIntro | null {
  if (!channel || channel.guild_id || channel.type !== ChannelType.DM || channel.recipients?.length !== 1) return null;
  const user = channel.recipients[0]!;
  return {
    user,
    name: nameOf(user),
    username: user.username,
    text: `This is the beginning of your direct message history with @${user.username}.`,
    canWave: empty,
  };
}
