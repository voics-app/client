// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useLightboxStore } from '@discordy/core/application/stores/lightboxStore';
import { useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { RelationshipType, type Relationship, type User } from '@discordy/core/contracts/rest';
import { useConnectionStore } from '@renderer/interface/app/connectionStore';
import { FriendsSince } from '@renderer/interface/features/members/FriendsSince';
import { ProfileAvatar } from '@renderer/interface/features/members/ProfileAvatar';

const user = (avatar: string | null) => ({ id: '7', username: 'sam', global_name: 'Sam', avatar }) as unknown as User;

beforeEach(() => {
  useLightboxStore.getState().close();
  useConnectionStore.setState({ cdnUrl: 'https://cdn' });
  useRelationshipStore.setState({ byUser: {} });
});
afterEach(cleanup);

describe('ProfileAvatar', () => {
  it('opens the avatar full size in the viewer', () => {
    render(<ProfileAvatar user={user('abc')} size={80} />);
    fireEvent.click(screen.getByRole('button', { name: "View Sam's avatar" }));
    const { items } = useLightboxStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'image', src: 'https://cdn/avatars/7/abc.png?size=1024', filename: 'Sam avatar' });
    expect(items[0]!.fallbacks).toContain('https://cdn/avatars/7/abc.gif?size=1024');
  });

  it('is not a button when there is no picture', () => {
    render(<ProfileAvatar user={user(null)} size={80} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('FriendsSince', () => {
  const set = (type: RelationshipType) => useRelationshipStore.setState({ byUser: { '7': { id: '7', type, user: user(null), since: '2026-03-04T10:00:00.000Z' } as Relationship } });

  it('shows when a friendship started', () => {
    set(RelationshipType.FRIEND);
    render(<FriendsSince userId="7" />);
    expect(screen.getByText('Friends since')).toBeTruthy();
    expect(document.querySelector('time')?.getAttribute('datetime')).toBe('2026-03-04T10:00:00.000Z');
  });

  it('shows nothing for people who are not friends', () => {
    set(RelationshipType.OUTGOING);
    const { container } = render(<FriendsSince userId="7" />);
    expect(container.textContent).toBe('');
  });
});
