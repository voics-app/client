import { RelationshipType, type Relationship, type User } from '@discordy/core/contracts/rest';
import { avatarUris, profileView } from '../../src/profile/profileModel';

const user: User = { id: '2', username: 'pat', global_name: 'Pat', avatar: 'abc', bio: 'Hello there' };
const friend = (since?: string): Relationship => ({ id: '2', type: RelationshipType.FRIEND, user, ...(since ? { since } : {}) });

describe('profileView', () => {
  it('shows display name, username, About me and Friends since', () => {
    const view = profileView(user, friend('2025-03-04T10:00:00Z'));
    expect(view).toMatchObject({ name: 'Pat', username: 'pat', bio: 'Hello there' });
    expect(view.friendsSince?.getUTCFullYear()).toBe(2025);
  });

  it('falls back to the username and leaves out what is unknown', () => {
    const view = profileView({ ...user, global_name: null, bio: undefined }, undefined);
    expect(view).toEqual({ name: 'pat', username: 'pat', bio: '', friendsSince: null, roles: [], memberSince: null });
  });

  it('lists the roles held in the server and when the person joined, highest role first', () => {
    const role = (id: string, name: string, position: number) => ({ id, name, color: 0, hoist: false, position, permissions: '0', managed: false, mentionable: false });
    const view = profileView(user, undefined, undefined, {
      roles: [role('r1', 'Mods', 2), role('r2', 'Regulars', 1), role('r3', 'Other', 9)],
      member: { user, roles: ['r2', 'r1'], joined_at: '2024-05-06T10:00:00Z', deaf: false, mute: false },
    });
    expect(view.roles).toEqual(['Mods', 'Regulars']);
    expect(view.memberSince?.getUTCFullYear()).toBe(2024);
  });

  it('prefers the freshly fetched About me', () => {
    expect(profileView(user, undefined, 'Fetched').bio).toBe('Fetched');
  });

  it('shows no friendship date for a pending request', () => {
    expect(profileView(user, { ...friend('2025-03-04T10:00:00Z'), type: RelationshipType.OUTGOING }).friendsSince).toBeNull();
  });
});

describe('avatarUris', () => {
  it('lists CDN candidates, or none without an avatar', () => {
    expect(avatarUris('https://cdn.test', user)[0]).toBe('https://cdn.test/avatars/2/abc.png?size=128');
    expect(avatarUris('https://cdn.test', { ...user, avatar: null })).toEqual([]);
    expect(avatarUris('', user)).toEqual([]);
  });
});
