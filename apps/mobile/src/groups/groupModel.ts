import { RelationshipType, type Channel, type Relationship, type User } from '@discordy/core/contracts/rest';
import { MAX_GROUP_DM_MEMBERS } from '@discordy/core/domain/dmModel';

export interface GroupSettingsView {
  isOwner: boolean;
  /** You first, then the others. */
  members: User[];
  /** Friends who are not in the group and not bots, to add. */
  addable: User[];
  full: boolean;
  /**
   * Members can be changed here only in a group with standard delivery. Changing who is in an encrypted group has to commit a membership change
   * with the encryption core, which the mobile app does not have yet, so doing it here would leave the group inconsistent for the others.
   */
  canChangeMembers: boolean;
}

/** What the group settings page shows and allows, by desktop's rules: friends can be added by anyone in the group, only the owner removes people. */
export function groupSettingsView(channel: Channel, me: User, relationships: Record<string, Relationship>): GroupSettingsView {
  const recipients = channel.recipients ?? [];
  const inGroup = new Set(recipients.map((u) => u.id));
  const addable = Object.values(relationships)
    .filter((r) => r.type === RelationshipType.FRIEND && !r.user.bot && !inGroup.has(r.user.id))
    .map((r) => r.user);
  return {
    isOwner: channel.owner_id === me.id,
    members: [me, ...recipients],
    addable,
    full: recipients.length + 1 >= MAX_GROUP_DM_MEMBERS,
    canChangeMembers: channel.delivery_mode === 'standard',
  };
}

export const GROUP_NAME_MAX = 100;
