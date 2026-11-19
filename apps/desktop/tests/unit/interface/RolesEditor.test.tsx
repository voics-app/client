// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { Permission } from '@discordy/core/contracts/permissions';
import type { User } from '@discordy/core/contracts/rest';

const updateRole = vi.fn(async (_g: string, id: string, changes: Record<string, unknown>) => ({ id, position: 1, managed: false, ...changes }));
const reorderRoles = vi.fn(async (_g: string, changes: { id: string; position: number }[]) => changes);
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: { reorderRoles, updateRole, addMemberRole: async () => undefined, removeMemberRole: async () => undefined } }) }));

import { RolesEditor } from '@renderer/interface/features/settings/server/RolesEditor';

const G = 'g1';
const user = (id: string) => ({ id, username: id, global_name: null, avatar: null }) as unknown as User;
const role = (id: string, position: number, permissions = '0') => ({ id, name: id, color: 0, hoist: false, position, permissions, managed: false, mentionable: false });
const member = (id: string, roles: string[]) => ({ user: user(id), roles, joined_at: '2026-01-01T00:00:00Z', deaf: false, mute: false });

function seed(me: string) {
  useSessionStore.setState({ user: user(me) } as never);
  useGuildStore.setState({
    guilds: { [G]: { id: G, name: 'G', owner_id: 'owner', emojis: [], roles: [role(G, 0), role('low', 1), role('low2', 2), role('mod', 3, String(Permission.MANAGE_ROLES)), role('high', 4)] } } as never,
    members: { [G]: { owner: member('owner', []), mod: member('mod', ['mod']), a: member('a', ['low']) } } as never,
  });
}

beforeEach(() => { reorderRoles.mockClear(); updateRole.mockClear(); });
afterEach(cleanup);

describe('RolesEditor', () => {
  it('shows member counts and locks roles at or above the actor', () => {
    seed('mod');
    render(<RolesEditor guildId={G} />);
    expect(screen.getByTestId('role-row-low').getAttribute('draggable')).toBe('true');
    expect(screen.getByTestId('role-row-mod').getAttribute('draggable')).toBe('false');
    expect(screen.getByTestId('role-row-high').getAttribute('draggable')).toBe('false');
    expect(screen.getByLabelText('3 members')).toBeTruthy();
  });

  it('reorders roles below the actor by drag and sends bulk positions', () => {
    seed('mod');
    render(<RolesEditor guildId={G} />);
    fireEvent.dragStart(screen.getByTestId('role-row-low'), { dataTransfer: { effectAllowed: '' } });
    fireEvent.drop(screen.getByTestId('role-row-low2'));
    expect(reorderRoles).toHaveBeenCalledWith(G, [{ id: 'low', position: 2 }, { id: 'low2', position: 1 }]);
  });

  it('does not allow dropping onto locked rows', () => {
    seed('mod');
    render(<RolesEditor guildId={G} />);
    fireEvent.dragStart(screen.getByTestId('role-row-low'), { dataTransfer: { effectAllowed: '' } });
    fireEvent.drop(screen.getByTestId('role-row-high'));
    expect(reorderRoles).toHaveBeenCalledWith(G, [{ id: 'low', position: 2 }, { id: 'low2', position: 1 }]);
  });

  it('lets the owner move any role', () => {
    seed('owner');
    render(<RolesEditor guildId={G} />);
    expect(screen.getByTestId('role-row-high').getAttribute('draggable')).toBe('true');
  });

  it('saves the display separately setting as the role hoist flag', () => {
    seed('owner');
    render(<RolesEditor guildId={G} />);
    fireEvent.click(screen.getByTestId('role-row-low').querySelector('button')!);
    const toggle = screen.getByRole('switch', { name: 'Display separately' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(updateRole).toHaveBeenCalledWith(G, 'low', expect.objectContaining({ hoist: true }));
  });

  it('warns for administrator and clears permissions', () => {
    seed('owner');
    useGuildStore.getState().upsertRole(G, role('low', 1, '8'));
    render(<RolesEditor guildId={G} />);
    fireEvent.click(screen.getByTestId('role-row-low').querySelector('button')!);
    fireEvent.click(screen.getByRole('tab', { name: 'Permissions' }));
    expect(screen.getByRole('alert').textContent).toContain('Administrator');
    fireEvent.click(screen.getByRole('button', { name: 'Clear permissions' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
