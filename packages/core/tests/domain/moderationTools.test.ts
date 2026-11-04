import { describe, expect, it } from 'vitest';
import type { GuildMember } from '@discordy/core/contracts/rest';
import {
  BULK_DELETE_MAX_AGE_MS,
  DEFAULT_MEMBER_FILTER,
  bulkDeletePlan,
  filterBans,
  canPruneMembers,
  isMemberAuditEntry,
  PRUNE_DAY_CHOICES,
  pruneSummary,
  filterMembers,
  isTimedOut,
  purgeableMessageIds,
} from '@discordy/core/domain/moderationTools';
import { snowflakeFromTimestamp } from '@discordy/core/domain/snowflake';

const idAt = (ms: number) => snowflakeFromTimestamp(ms);
const NOW = 1_800_000_000_000;

describe('purgeableMessageIds', () => {
  it('keeps only the author sent messages younger than two weeks', () => {
    const fresh = idAt(NOW - 1000);
    const old = idAt(NOW - BULK_DELETE_MAX_AGE_MS - 1000);
    const messages = [
      { id: fresh, authorId: 'a' },
      { id: old, authorId: 'a' },
      { id: idAt(NOW - 2000), authorId: 'b' },
      { id: idAt(NOW - 3000), authorId: 'a', local: true },
    ];
    expect(purgeableMessageIds(messages, 'a', NOW)).toEqual([fresh]);
  });
});

describe('bulkDeletePlan', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => String(i));
  it('batches by 100 and never leaves a batch of one', () => {
    expect(bulkDeletePlan(ids(0))).toEqual({ batches: [], single: null });
    expect(bulkDeletePlan(ids(1))).toEqual({ batches: [], single: '0' });
    expect(bulkDeletePlan(ids(2)).batches).toHaveLength(1);
    const plan = bulkDeletePlan(ids(201));
    expect(plan.batches.map((b) => b.length)).toEqual([100, 100]);
    expect(plan.single).toBe('200');
  });
});

const member = (id: string, extra: Partial<GuildMember> = {}): GuildMember =>
  ({ user: { id, username: id }, roles: [], joined_at: '2026-01-01T00:00:00Z', ...extra }) as GuildMember;

describe('filterMembers', () => {
  const list = [
    member('carol', { joined_at: '2026-03-01T00:00:00Z', roles: ['mod'] }),
    member('alice', { joined_at: '2026-01-01T00:00:00Z', communication_disabled_until: new Date(NOW + 60_000).toISOString() }),
    member('bob', { joined_at: '2026-02-01T00:00:00Z', communication_disabled_until: new Date(NOW - 60_000).toISOString() }),
  ];
  const nameOf = (m: GuildMember) => m.user.username;
  const names = (f: Partial<typeof DEFAULT_MEMBER_FILTER>) =>
    filterMembers(list, { ...DEFAULT_MEMBER_FILTER, ...f }, nameOf, NOW).map(nameOf);

  it('sorts by name or join date', () => {
    expect(names({})).toEqual(['alice', 'bob', 'carol']);
    expect(names({ sort: 'joined-newest' })).toEqual(['carol', 'bob', 'alice']);
    expect(names({ sort: 'joined-oldest' })).toEqual(['alice', 'bob', 'carol']);
  });
  it('filters by role, timeout and text', () => {
    expect(names({ roleId: 'mod' })).toEqual(['carol']);
    expect(names({ timedOutOnly: true })).toEqual(['alice']);
    expect(names({ query: 'BO' })).toEqual(['bob']);
  });
  it('treats an expired timeout as not timed out', () => {
    expect(isTimedOut(list[2]!, NOW)).toBe(false);
    expect(isTimedOut(list[1]!, NOW)).toBe(true);
  });
});

describe('filterBans', () => {
  const bans = [
    { user: { id: '1', username: 'spam' }, reason: 'advertising' },
    { user: { id: '2', username: 'troll', global_name: 'Big Troll' }, reason: null },
  ];
  it('searches name, id and reason', () => {
    expect(filterBans(bans, '')).toHaveLength(2);
    expect(filterBans(bans, 'advert')).toHaveLength(1);
    expect(filterBans(bans, 'big')).toHaveLength(1);
    expect(filterBans(bans, '2')).toHaveLength(1);
  });
});

describe('isMemberAuditEntry', () => {
  it('is true for entries about a user and false for the rest', () => {
    expect(isMemberAuditEntry({ action_type: 22, target_id: '5' })).toBe(true);
    expect(isMemberAuditEntry({ action_type: 20, target_id: '5' })).toBe(true);
    expect(isMemberAuditEntry({ action_type: 25, target_id: '5' })).toBe(true);
    expect(isMemberAuditEntry({ action_type: 22, target_id: null })).toBe(false);
    expect(isMemberAuditEntry({ action_type: 30, target_id: '5' })).toBe(false);
  });
});

describe('prune helpers', () => {
  it('offers 1 to 30 days and summarises the count', () => {
    expect(PRUNE_DAY_CHOICES).toEqual([1, 7, 14, 30]);
    expect(pruneSummary(0, 7)).toBe('No members have been inactive for 7 days.');
    expect(pruneSummary(1, 1)).toBe('1 member has been inactive for 1 day and would be removed.');
    expect(pruneSummary(12, 30)).toBe('12 members have been inactive for 30 days and would be removed.');
  });
});

describe('canPruneMembers', () => {
  const KICK = 1n << 1n;
  const ADMIN = 1n << 3n;
  it('needs KICK_MEMBERS, or ADMINISTRATOR when the guild restricts pruning', () => {
    expect(canPruneMembers(KICK, false)).toBe(true);
    expect(canPruneMembers(0n, false)).toBe(false);
    expect(canPruneMembers(KICK, true)).toBe(false);
    expect(canPruneMembers(ADMIN, true)).toBe(true);
  });
});
