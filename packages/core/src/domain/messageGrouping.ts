/** Discord-style visual grouping of consecutive messages. */

export const GROUP_WINDOW_MS = 7 * 60_000;

export interface GroupableMessage {
  id: string;
  authorId: string;
  timestamp: number;
  /** Replies and system messages always start a new group. */
  breaksGroup?: boolean;
}

export interface GroupedMessage<T extends GroupableMessage> {
  message: T;
  startsGroup: boolean;
  startsDay: boolean;
}

function sameLocalDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/** Input must be ordered oldest → newest. */
export function groupMessages<T extends GroupableMessage>(messages: readonly T[]): GroupedMessage<T>[] {
  return messages.map((message, i) => {
    const previous = messages[i - 1];
    const startsDay = !previous || !sameLocalDay(previous.timestamp, message.timestamp);
    const startsGroup =
      startsDay ||
      !previous ||
      Boolean(message.breaksGroup) ||
      previous.authorId !== message.authorId ||
      message.timestamp - previous.timestamp > GROUP_WINDOW_MS;
    return { message, startsGroup, startsDay };
  });
}
