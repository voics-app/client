import { describe, expect, it } from 'vitest';
import { RelationshipType, type Relationship } from '@discordy/core/contracts/rest';
import { BIO_MAX_LENGTH, friendsSince } from '@discordy/core/domain/profile';

const rel = (type: RelationshipType, since?: string) => ({ id: '2', type, user: {}, since }) as unknown as Relationship;

describe('friendsSince', () => {
  it('returns the time a friendship started', () => {
    expect(friendsSince(rel(RelationshipType.FRIEND, '2026-03-04T10:00:00.000Z'))?.toISOString()).toBe('2026-03-04T10:00:00.000Z');
  });

  it('is null for anything that is not a friendship', () => {
    expect(friendsSince(undefined)).toBeNull();
    expect(friendsSince(rel(RelationshipType.OUTGOING, '2026-03-04T10:00:00.000Z'))).toBeNull();
    expect(friendsSince(rel(RelationshipType.BLOCKED, '2026-03-04T10:00:00.000Z'))).toBeNull();
  });

  it('is null when the time is missing or unreadable', () => {
    expect(friendsSince(rel(RelationshipType.FRIEND))).toBeNull();
    expect(friendsSince(rel(RelationshipType.FRIEND, 'yesterday'))).toBeNull();
  });
});

describe('BIO_MAX_LENGTH', () => {
  it('is 300 characters', () => {
    expect(BIO_MAX_LENGTH).toBe(300);
  });
});
