// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { usePresenceStore } from '@renderer/application/stores/peopleStores';
import type { User } from '@shared/contracts/rest';

const send = vi.fn();
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ gateway: { send }, api: {} }) }));

import { MemberList } from '@renderer/interface/features/members/MemberList';

const G = 'g1';
const user = (id: string, bot = false) => ({ id, username: id, global_name: null, avatar: null, bot }) as unknown as User;
const member = (id: string, roles: string[] = [], bot = false) => ({ user: user(id, bot), roles, joined_at: '2026-01-01T00:00:00Z', deaf: false, mute: false });
const role = (id: string, position: number, extra = {}) => ({ id, name: id, color: 0, hoist: false, position, permissions: '0', managed: false, mentionable: false, ...extra });

beforeEach(() => {
  send.mockClear();
  useGuildStore.setState({
    guilds: { [G]: { id: G, name: 'G', owner_id: 'owner', emojis: [], roles: [role(G, 0), role('adm', 5, { hoist: true, name: 'Admins' })] } } as never,
    members: { [G]: { owner: member('owner', ['adm']), alice: member('alice'), robo: member('robo', [], true), zed: member('zed') } } as never,
  });
  usePresenceStore.setState({
    byUser: {
      owner: { status: 'online', activities: [] },
      alice: { status: 'idle', activities: [{ name: 'Custom Status', type: 4, state: 'brb lunch' }] },
      robo: { status: 'online', activities: [] },
    },
  });
});
afterEach(cleanup);

describe('MemberList', () => {
  it('groups by hoisted role, online and offline with counts, crown and bot tag', () => {
    render(<MemberList guildId={G} />);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['Admins1', 'Online2', 'Offline1']);
    expect(screen.getByLabelText('Server owner')).toBeTruthy();
    expect(screen.getByText('BOT')).toBeTruthy();
    expect(screen.getByText('brb lunch')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'idle' })).toBeTruthy();
  });

  it('collapses and expands a group', () => {
    render(<MemberList guildId={G} />);
    expect(screen.getByText('zed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Offline/ }));
    expect(screen.queryByText('zed')).toBeNull();
    expect(screen.getByRole('button', { name: /Offline/ }).getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: /Offline/ }));
    expect(screen.getByText('zed')).toBeTruthy();
  });

  it('searches loaded members at once and asks the gateway with the query', () => {
    vi.useFakeTimers();
    try {
      render(<MemberList guildId={G} />);
      fireEvent.change(screen.getByLabelText('Search members'), { target: { value: 'ze' } });
      expect(screen.getByText('zed')).toBeTruthy();
      expect(screen.queryByText('alice')).toBeNull();
      act(() => void vi.advanceTimersByTime(300));
      expect(send).toHaveBeenLastCalledWith(8, expect.objectContaining({ guild_id: G, query: 'ze', presences: true }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a hover card with the activity after a short delay', () => {
    vi.useFakeTimers();
    try {
      render(<MemberList guildId={G} />);
      fireEvent.mouseEnter(screen.getByText('alice').closest('button')!);
      act(() => void vi.advanceTimersByTime(400));
      expect(screen.getByRole('tooltip').textContent).toContain('brb lunch');
    } finally {
      vi.useRealTimers();
    }
  });

  it('virtualises very large lists', () => {
    const many: Record<string, ReturnType<typeof member>> = {};
    for (let i = 0; i < 1000; i++) many[`u${i}`] = member(`u${i}`);
    useGuildStore.setState({ members: { [G]: many } as never });
    const { container } = render(<MemberList guildId={G} />);
    expect(container.querySelectorAll('.member-row').length).toBeLessThan(100);
  });
});
