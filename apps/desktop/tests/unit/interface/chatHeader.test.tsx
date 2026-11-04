// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useReadNavStore } from '@renderer/application/stores/readNavStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { Permission } from '@discordy/core/contracts/permissions';
import { TopicPopout } from '@renderer/interface/features/chat/ChannelHeader';
import { PinsPanel } from '@renderer/interface/features/panels/PinsPanel';

const api = {
  updateChannel: vi.fn(),
  pins: vi.fn(),
  unpin: vi.fn(),
};
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api }) }));

const G = 'g1';
const user = (id: string) => ({ id, username: id, global_name: null, avatar: null });
const channel = { id: 'c1', guild_id: G, type: 0, name: 'general', topic: 'Read the **rules**' };

function seed(perms: bigint) {
  useSessionStore.setState({ user: user('me') } as never);
  useGuildStore.setState({
    guilds: { [G]: { id: G, name: 'G', owner_id: 'owner', roles: [{ id: G, name: '@everyone', color: 0, hoist: false, position: 0, permissions: (perms | Permission.VIEW_CHANNEL).toString(), managed: false, mentionable: false }] } } as never,
    members: { [G]: { me: { user: user('me'), roles: [], joined_at: '', deaf: false, mute: false } } } as never,
    channels: { c1: channel } as never,
  });
}

const pin = (id: string, content: string) => ({ id, channel_id: 'c1', guild_id: G, author: user('bob'), content, timestamp: '2026-01-01T00:00:00Z', attachments: [], embeds: [], mentions: [], mention_roles: [] });
const renderPins = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PinsPanel channelId="c1" />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  api.pins.mockResolvedValue([pin('p1', 'first pin'), pin('p2', 'second pin')]);
  api.unpin.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('TopicPopout', () => {
  it('renders the topic as markdown without an edit button for others', () => {
    seed(0n);
    render(<TopicPopout channel={channel as never} canEdit={false} onClose={() => undefined} />);
    expect(screen.getByText('rules').tagName).toBe('STRONG');
    expect(screen.queryByRole('button', { name: 'Edit topic' })).toBeNull();
  });

  it('saves an edited topic for MANAGE_CHANNELS holders', async () => {
    seed(Permission.MANAGE_CHANNELS);
    api.updateChannel.mockResolvedValue({ ...channel, topic: 'New topic' });
    render(<TopicPopout channel={channel as never} canEdit onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit topic' }));
    fireEvent.change(screen.getByLabelText('Channel topic'), { target: { value: '  New topic ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.updateChannel).toHaveBeenCalledWith('c1', { topic: 'New topic' }));
    await waitFor(() => expect(useGuildStore.getState().channels.c1?.topic).toBe('New topic'));
  });

  it('closes on Escape', () => {
    seed(0n);
    const onClose = vi.fn();
    render(<TopicPopout channel={channel as never} canEdit={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('PinsPanel', () => {
  it('shows Unpin only with MANAGE_MESSAGES', async () => {
    seed(0n);
    renderPins();
    await screen.findByText('first pin');
    expect(screen.queryByRole('button', { name: 'Unpin' })).toBeNull();
    cleanup();
    seed(Permission.MANAGE_MESSAGES);
    renderPins();
    await screen.findByText('first pin');
    expect(screen.getAllByRole('button', { name: 'Unpin' })).toHaveLength(2);
  });

  it('unpins through the API and drops the card', async () => {
    seed(Permission.MANAGE_MESSAGES);
    renderPins();
    await screen.findByText('first pin');
    fireEvent.click(screen.getAllByRole('button', { name: 'Unpin' })[0]!);
    await waitFor(() => expect(api.unpin).toHaveBeenCalledWith('c1', 'p1'));
    await waitFor(() => expect(screen.queryByText('first pin')).toBeNull());
    expect(screen.getByText('second pin')).toBeTruthy();
  });

  it('Jump requests a scroll to that message', async () => {
    seed(0n);
    useUiStore.setState({ view: { kind: 'guild', guildId: G, channelId: 'c1' } } as never);
    renderPins();
    await screen.findByText('second pin');
    fireEvent.click(screen.getAllByRole('button', { name: 'Jump' })[1]!);
    expect(useReadNavStore.getState().jump).toMatchObject({ channelId: 'c1', messageId: 'p2' });
  });
});
