import { describe, expect, it } from 'vitest';
import { RelationshipType, type Relationship } from '@discordy/core/contracts/rest';
import { BIO_MAX_LENGTH, friendsSince, profileBackground, profileColor, profileImageCandidates } from '@discordy/core/domain/profile';
import type { GuildMember, User } from '@discordy/core/contracts/rest';

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

describe('profile appearance', () => {
  it('renders exactly two RGB colours, including black, and rejects malformed values', () => {
    expect(profileColor(0)).toBe('#000000');
    expect(profileBackground({ theme_colors: [0, 0xffffff], accent_color: 123 })).toBe('linear-gradient(120deg, #000000, #ffffff)');
    expect(profileBackground({ theme_colors: null, accent_color: 0 })).toBe('#000000');
    for (const invalid of [-1, 0x1000000, Infinity, NaN, 1.5]) expect(profileColor(invalid)).toBeUndefined();
    expect(profileBackground({ theme_colors: [-1, 1], accent_color: 0 })).toBe('#000000');
  });

  it('uses server asset paths and returns to global images after an override is cleared', () => {
    const user: User = { id: '7', username: 'Sam', global_name: null, avatar: 'global', banner: 'global-banner' };
    const member = { avatar: 'server', banner: 'a_animated' } as GuildMember;
    expect(profileImageCandidates('https://cdn', user, 'avatars', member, '9')).toEqual(['https://cdn/guilds/9/users/7/avatars/server.png?size=512']);
    expect(profileImageCandidates('https://cdn', user, 'banners', member, '9')[0]).toBe('https://cdn/guilds/9/users/7/banners/a_animated.gif?size=512');
    expect(profileImageCandidates('https://cdn', user, 'avatars', { ...member, avatar: null }, '9')[0]).toBe('https://cdn/avatars/7/global.png?size=512');
    expect(profileImageCandidates('https://cdn', { ...user, avatar: '../private' }, 'avatars')).toEqual([]);
    expect(profileImageCandidates('https://cdn', { ...user, id: '7/../8' }, 'avatars')).toEqual([]);
    expect(profileImageCandidates('https://cdn', user, 'avatars', member, '../9')).toEqual([]);
  });
});
