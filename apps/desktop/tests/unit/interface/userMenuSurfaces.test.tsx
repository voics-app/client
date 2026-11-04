// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useVoiceStore } from '@renderer/application/stores/voiceStore';
import { ALL_PERMISSIONS } from '@discordy/core/contracts/permissions';
import type { GuildMember, Role, VoiceState } from '@discordy/core/contracts/rest';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { VoiceOccupant } from '@renderer/interface/features/channels/ChannelSidebar';
import { UserMenuTarget } from '@renderer/interface/features/members/UserContextMenu';

const G = 'g1';
const role = (id: string, position: number, permissions = '0', extra: Partial<Role> = {}): Role => ({
  id, name: id, color: 0, hoist: false, position, permissions, managed: false, mentionable: false, ...extra,
});
const user = (id: string) => ({ id, username: id, global_name: null, avatar: null }) as unknown as GuildMember['user'];
const member = (id: string, roles: string[]): GuildMember => ({
  user: user(id), roles, joined_at: '2026-01-01T00:00:00Z', deaf: false, mute: false,
});

function seed(actor: string, actorRoles: string[]) {
  useSessionStore.setState({ user: user(actor) } as never);
  useGuildStore.setState({
    guilds: {
      [G]: {
        id: G, name: 'Guild', owner_id: 'owner',
        roles: [
          role(G, 0, '0'),
          role('helper', 1, '0', { color: 0x00ff00 }),
          role('admin', 10, ALL_PERMISSIONS.toString()),
        ],
      },
    } as never,
    members: {
      [G]: {
        owner: member('owner', []),
        alice: member('alice', actorRoles),
        bob: member('bob', ['helper']),
        carol: member('carol', ['admin']),
      },
    },
    channels: {
      v1: { id: 'v1', guild_id: G, type: 2, name: 'Voice', position: 0 },
      v2: { id: 'v2', guild_id: G, type: 2, name: 'Lounge', position: 1 },
    } as never,
  });
}

const voiceState = (userId: string): VoiceState =>
  ({ guild_id: G, channel_id: 'v1', user_id: userId, self_mute: false, self_deaf: false, mute: false, deaf: false }) as unknown as VoiceState;

const labels = () => screen.getAllByRole('menuitem').map((el) => el.textContent ?? '');

beforeEach(() => {
  usePrefsStore.setState({ developerMode: true });
  useVoiceStore.setState({ states: { [G]: { bob: voiceState('bob') } } } as never);
});
afterEach(cleanup);

describe('shared user menu on the voice channel list (left sidebar)', () => {
  it('opens on right-click and shows moderation for an admin, with roles as pills', async () => {
    seed('alice', ['admin']);
    render(<ul><VoiceOccupant guildId={G} state={voiceState('bob')} speaking={0} /></ul>);
    fireEvent.contextMenu(screen.getByText('bob'));
    const items = labels();
    expect(items).toEqual(expect.arrayContaining(['Profile', 'Message', 'Change nickname', 'Roles', 'Server mute', 'Server deafen', 'Move to', 'Disconnect', 'Timeout', 'Kick bob', 'Ban bob', 'Copy user ID']));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('list', { name: 'Roles' }).textContent).toContain('helper');
  });

  it('shows no moderation items to a member without permissions', () => {
    seed('alice', []);
    render(<ul><VoiceOccupant guildId={G} state={voiceState('bob')} speaking={0} /></ul>);
    fireEvent.contextMenu(screen.getByText('bob'));
    const items = labels();
    expect(items).toEqual(expect.arrayContaining(['Profile', 'Message', 'Block', 'Copy user ID']));
    for (const hidden of ['Roles', 'Timeout', 'Disconnect', 'Server mute', 'Kick bob', 'Ban bob']) {
      expect(items).not.toContain(hidden);
    }
  });

  it('hides moderation on someone who outranks the actor', () => {
    seed('alice', ['helper']);
    useVoiceStore.setState({ states: { [G]: { carol: voiceState('carol') } } } as never);
    render(<ul><VoiceOccupant guildId={G} state={voiceState('carol')} speaking={0} /></ul>);
    fireEvent.contextMenu(screen.getByText('carol'));
    expect(labels()).not.toContain('Kick carol');
  });
});

describe('shared user menu on a chat author', () => {
  it('opens from the author name wrapper with the same items', () => {
    seed('alice', ['admin']);
    render(
      <UserMenuTarget userId='bob' name='bob' guildId={G} user={user('bob')}>
        <button type='button'>bob</button>
      </UserMenuTarget>,
    );
    fireEvent.contextMenu(screen.getByRole('button', { name: 'bob' }));
    const items = labels();
    expect(items).toEqual(expect.arrayContaining(['Profile', 'Message', 'Roles', 'Timeout', 'Kick bob', 'Ban bob']));
  });

  it('offers server mute only while the target is in voice', () => {
    seed('alice', ['admin']);
    useVoiceStore.setState({ states: {} } as never);
    render(
      <UserMenuTarget userId='bob' name='bob' guildId={G} user={user('bob')}>
        <button type='button'>bob</button>
      </UserMenuTarget>,
    );
    fireEvent.contextMenu(screen.getByRole('button', { name: 'bob' }));
    const items = labels();
    expect(items).not.toContain('Server mute');
    expect(items).not.toContain('Disconnect');
    expect(items).toContain('Kick bob');
  });
});
