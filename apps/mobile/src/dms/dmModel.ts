import { ChannelType, type Channel, type Relationship, type User } from '@discordy/core/contracts/rest';
import { visibleDms, type ClosedDms } from '@discordy/core/domain/dmModel';
import { timestampOf } from '@discordy/core/domain/snowflake';

export interface DmRow {
  id: string;
  title: string;
  group: boolean;
  /** The other person of a 1:1 conversation; null for groups. */
  peer: User | null;
  /** Ephemeral and P2P delivery: the conversation lives on devices and mobile cannot open it yet. */
  private: boolean;
  /** Epoch milliseconds of the latest activity, for the row's time. */
  activityAt: number;
}

export interface DmRowsInput {
  channels: Record<string, Channel>;
  closed: ClosedDms;
  relationships: Record<string, Relationship>;
}

/** A person's name as the user sees it: their nickname for a friend, else global name, else username. */
export function personName(user: User, relationships: Record<string, Relationship>): string {
  return relationships[user.id]?.nickname || user.global_name || user.username || 'Unknown user';
}

/** A conversation's title: the group name, else the other people's names. */
export function dmTitle(channel: Channel, relationships: Record<string, Relationship>): string {
  const group = channel.type === ChannelType.GROUP_DM;
  const names = (channel.recipients ?? []).map((u) => personName(u, relationships));
  return channel.name || names.join(', ') || (group ? 'Empty group' : 'Unknown user');
}

/** Open conversations in core's order (most recent activity first), with the names and flags a row needs. */
export function dmRows({ channels, closed, relationships }: DmRowsInput): DmRow[] {
  return visibleDms(channels, closed).map((channel) => {
    const group = channel.type === ChannelType.GROUP_DM;
    const recipients = channel.recipients ?? [];
    return {
      id: channel.id,
      title: dmTitle(channel, relationships),
      group,
      peer: !group && recipients.length === 1 ? recipients[0]! : null,
      private: channel.delivery_mode !== 'standard',
      activityAt: timestampOf(channel.last_message_id ?? channel.id),
    };
  });
}

export type DmListItem = { kind: 'header'; title: string } | { kind: 'dm'; row: DmRow; pinned: boolean };

/** The DM column's items: pinned conversations first, in pin order under a Pinned heading, then the rest under Direct messages. Pins of closed or absent conversations are ignored. */
export function dmListItems(rows: readonly DmRow[], pins: readonly string[]): DmListItem[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const pinned = pins.flatMap((id) => byId.get(id) ?? []);
  const pinnedIds = new Set(pinned.map((row) => row.id));
  const rest = rows.filter((row) => !pinnedIds.has(row.id));
  return [
    ...(pinned.length > 0 ? [{ kind: 'header', title: 'Pinned' } as const] : []),
    ...pinned.map((row) => ({ kind: 'dm', row, pinned: true }) as const),
    ...(pinned.length > 0 && rest.length > 0 ? [{ kind: 'header', title: 'Direct messages' } as const] : []),
    ...rest.map((row) => ({ kind: 'dm', row, pinned: false }) as const),
  ];
}
