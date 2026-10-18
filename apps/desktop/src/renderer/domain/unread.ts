import { compareSnowflakes } from './snowflake';

export function isUnread(lastMessageId: string | null | undefined, lastReadId: string | null | undefined): boolean {
  if (!lastMessageId) return false;
  if (!lastReadId) return true;
  return compareSnowflakes(lastMessageId, lastReadId) > 0;
}

export function formatBadgeCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}
