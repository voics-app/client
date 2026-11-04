/** Audit log event codes (Discord AuditLogEvent values the api records) as a sentence tail. */
export const AUDIT_ACTIONS: Record<number, string> = {
  1: 'updated the server', 10: 'created a channel', 11: 'updated a channel', 12: 'deleted a channel', 13: 'created a permission overwrite', 14: 'updated a permission overwrite', 15: 'deleted a permission overwrite',
  20: 'kicked a member', 21: 'pruned inactive members', 22: 'banned a member', 23: 'unbanned a member', 24: 'updated a member', 25: 'updated a member’s roles', 30: 'created a role', 31: 'updated a role', 32: 'deleted a role',
  40: 'created an invite', 42: 'deleted an invite', 60: 'created an emoji', 61: 'updated an emoji', 62: 'deleted an emoji', 72: 'deleted a message', 73: 'bulk-deleted messages', 74: 'pinned a message', 75: 'unpinned a message',
};
