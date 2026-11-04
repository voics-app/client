import { describe, expect, it } from 'vitest';
import { dmCandidates } from '@discordy/core/application/dmCandidates';
import { displayName } from '@renderer/interface/shared/hooks/useNames';
import { RelationshipType, type Channel, type GuildMember, type Relationship, type User } from '@discordy/core/contracts/rest';

const user = (id: string, extra: Partial<User> = {}): User => ({ id, username: `u${id}`, global_name: null, avatar: null, ...extra });
const rel = (id: string, type: number, extra: Partial<User> = {}): Relationship => ({ id, type: type as Relationship['type'], user: user(id, extra) });
const member = (id: string, extra: Partial<User> = {}): GuildMember =>
  ({ user: user(id, extra), roles: [], joined_at: '2026-01-01', deaf: false, mute: false }) as GuildMember;

const base = { meId: '1', members: {}, channels: {}, relationships: {}, displayName };

describe('dmCandidates', () => {
  it('lists a friend from the relationship store even when they share no server or DM', () => {
    const list = dmCandidates({ ...base, relationships: { '2': rel('2', RelationshipType.FRIEND) } });
    expect(list.map((p) => p.id)).toEqual(['2']);
  });

  it('does not list pending requests, blocked users or myself', () => {
    const list = dmCandidates({
      ...base,
      relationships: {
        '2': rel('2', RelationshipType.INCOMING),
        '3': rel('3', RelationshipType.OUTGOING),
        '4': rel('4', RelationshipType.BLOCKED),
        '1': rel('1', RelationshipType.FRIEND),
      },
    });
    expect(list).toEqual([]);
  });

  it('includes a friend immediately after the pending request is upgraded to friend (same id)', () => {
    const before = dmCandidates({ ...base, relationships: { '2': rel('2', RelationshipType.INCOMING, { username: 'bob' }) } });
    expect(before).toEqual([]);
    const after = dmCandidates({ ...base, relationships: { '2': rel('2', RelationshipType.FRIEND, { username: 'bob' }) } });
    expect(after).toEqual([{ id: '2', name: 'bob', avatar: null }]);
  });

  it('uses the friend nickname when present', () => {
    const list = dmCandidates({ ...base, relationships: { '2': { ...rel('2', RelationshipType.FRIEND, { username: 'bob' }), nickname: 'Bobby' } } });
    expect(list[0]?.name).toBe('Bobby');
  });

  it('keeps guild members and DM recipients, skipping me and bots, and de-duplicates by id', () => {
    const channels: Record<string, Channel> = {
      c1: { id: 'c1', type: 1, recipients: [user('5', { global_name: 'Eve' }), user('1')] } as unknown as Channel,
    };
    const list = dmCandidates({
      ...base,
      members: { g1: { '2': member('2'), '6': member('6', { bot: true }), '1': member('1') }, g2: { '2': member('2', { username: 'dup' }) } },
      channels,
      relationships: { '2': rel('2', RelationshipType.FRIEND) },
    });
    expect(list.map((p) => [p.id, p.name]).sort()).toEqual([
      ['2', 'u2'],
      ['5', 'Eve'],
    ]);
  });
});
