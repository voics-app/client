// @vitest-environment jsdom
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { useVoiceStore } from '@renderer/application/stores/voiceStore';
import { ALL_PERMISSIONS, Permission } from '@discordy/core/contracts/permissions';
import { ChannelSidebar } from '@renderer/interface/features/channels/ChannelSidebar';

const updateMember = vi.fn(async (_g: string, u: string, patch: { channel_id: string | null }) => ({ user: { id: u }, roles: [], ...patch }));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: { updateMember: (...a: [string, string, never]) => updateMember(...a) } }) }));
vi.mock('@renderer/interface/app/voiceActions', () => ({ openVoiceChannel: vi.fn(async () => undefined) }));

const G = 'g1';
const user = (id: string) => ({ id, username: id, global_name: null, avatar: null });
const vs = (id: string, channel: string, over: Record<string, unknown> = {}) => ({ user_id: id, channel_id: channel, guild_id: G, session_id: 's', deaf: false, mute: false, self_deaf: false, self_mute: false, self_video: false, self_stream: false, suppress: false, ...over });

function seed(perms: bigint) {
  useSessionStore.setState({ user: user('alice') } as never);
  useGuildStore.setState({
    guilds: { [G]: { id: G, name: 'G', owner_id: 'owner', roles: [{ id: G, name: '@everyone', color: 0, hoist: false, position: 0, permissions: perms.toString(), managed: false, mentionable: false }] } } as never,
    members: { [G]: { alice: { user: user('alice'), roles: [] }, bob: { user: user('bob'), roles: [] } } } as never,
    channels: {
      v1: { id: 'v1', guild_id: G, type: 2, name: 'Lounge', position: 0, user_limit: 2 },
      v2: { id: 'v2', guild_id: G, type: 2, name: 'Quiet', position: 1 },
      t1: { id: 't1', guild_id: G, type: 0, name: 'general', position: 2 },
    } as never,
  });
  useVoiceStore.setState({
    states: { [G]: { bob: vs('bob', 'v1', { mute: true, self_deaf: true, self_video: true, self_stream: true }), carol: vs('carol', 'v1', { self_mute: true }) } } as never,
  });
  useUiStore.setState({ view: { kind: 'guild', guildId: G, channelId: 't1' } } as never);
}

const rowOf = (name: string) => screen.getByText(name).closest('li[data-channel-id]') as HTMLElement;
const dragBob = () => fireEvent.dragStart(screen.getByText('bob').closest('li')!, { dataTransfer: { setData: () => undefined, effectAllowed: '' } });

describe('voice channel rows', () => {
  beforeEach(() => updateMember.mockClear());
  afterEach(cleanup);

  it('renders icons, not letters, and tells server mute from self mute', () => {
    seed(ALL_PERMISSIONS);
    render(<ChannelSidebar guildId={G} />);
    expect(screen.getByLabelText('Server muted')).toBeTruthy();
    expect(screen.getByLabelText('Muted')).toBeTruthy();
    expect(screen.getByLabelText('Deafened')).toBeTruthy();
    expect(screen.getByLabelText('Camera on')).toBeTruthy();
    const occupants = [...document.querySelectorAll('.occupant')].map((o) => o.textContent);
    expect(occupants[0]).not.toMatch(/ [MV]$/);
    expect(occupants[0]).toMatch(/LIVE$/);
    expect(document.querySelectorAll('.occupant svg').length).toBeGreaterThanOrEqual(5);
  });

  it('shows n/limit and marks a full channel', () => {
    seed(Permission.VIEW_CHANNEL);
    render(<ChannelSidebar guildId={G} />);
    const cap = document.querySelector('.channel-capacity')!;
    expect(cap.textContent).toBe('2/2');
    expect(cap.classList.contains('is-full')).toBe(true);
    expect(screen.getByText('Lounge').closest('button')!.getAttribute('aria-disabled')).toBe('true');
  });

  it('a user with MOVE_MEMBERS can still join a full channel', () => {
    seed(Permission.VIEW_CHANNEL | Permission.MOVE_MEMBERS);
    render(<ChannelSidebar guildId={G} />);
    expect(screen.getByText('Lounge').closest('button')!.getAttribute('aria-disabled')).toBeNull();
  });

  it('dropping an occupant on another voice channel calls the move route', () => {
    seed(Permission.VIEW_CHANNEL | Permission.MOVE_MEMBERS);
    render(<ChannelSidebar guildId={G} />);
    dragBob();
    const target = rowOf('Quiet');
    const over = createEvent.dragOver(target);
    fireEvent(target, over);
    expect(over.defaultPrevented).toBe(true);
    expect(target.classList.contains('is-move-target')).toBe(true);
    fireEvent.drop(target);
    expect(updateMember).toHaveBeenCalledWith(G, 'bob', { channel_id: 'v2' });
  });

  it('refuses drops without permission, onto the same channel and onto text channels', () => {
    seed(Permission.VIEW_CHANNEL);
    render(<ChannelSidebar guildId={G} />);
    expect(screen.getByText('bob').closest('li')!.getAttribute('draggable')).toBe('false');
    cleanup();
    seed(Permission.VIEW_CHANNEL | Permission.MOVE_MEMBERS);
    render(<ChannelSidebar guildId={G} />);
    dragBob();
    for (const name of ['Lounge', 'general']) {
      const row = rowOf(name);
      const over = createEvent.dragOver(row);
      fireEvent(row, over);
      expect(over.defaultPrevented).toBe(false);
      fireEvent.drop(row);
    }
    expect(updateMember).not.toHaveBeenCalled();
  });
});
