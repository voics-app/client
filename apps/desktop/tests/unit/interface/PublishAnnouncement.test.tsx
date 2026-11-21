// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useMessageStore, type ChatMessage } from '@discordy/core/application/stores/messageStore';
import { Permission } from '@discordy/core/contracts/permissions';
import { ChannelType, MessageFlag } from '@discordy/core/contracts/rest';
import { useMessageInteractions } from '@renderer/interface/features/chat/useMessageInteractions';

const fixture = vi.hoisted(() => ({ publish: vi.fn() }));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: { publishAnnouncement: fixture.publish }, privacy: { sender: {} } }) }));
vi.mock('@renderer/interface/app/actions', () => ({ attempt: (run: () => Promise<unknown>) => run(), copyText: vi.fn(), markMessageUnread: vi.fn() }));
vi.mock('@renderer/interface/shared/hooks/usePermissions', () => ({ useChannelPermissions: () => Permission.SEND_MESSAGES, useGuildPermissions: () => 0n, can: (value: bigint, bit: bigint) => (value & bit) === bit }));

const message = { id: '30', channel_id: '10', guild_id: '1', author: { id: '7', username: 'owner' }, content: 'News', type: 0, flags: 0, attachments: [], embeds: [], reactions: [] } as unknown as ChatMessage;
function Row({ item }: { item: ChatMessage }) {
  const actions = useMessageInteractions(item, '1', { me: '7', editing: false, blocked: false });
  return <div data-testid="message" {...actions.rootProps}>{actions.toolbar}{actions.overlays}</div>;
}
beforeEach(() => {
  useGuildStore.getState().reset();
  useGuildStore.setState({ channels: { '10': { id: '10', guild_id: '1', type: ChannelType.GUILD_ANNOUNCEMENT, name: 'news', delivery_mode: 'standard' } } });
  fixture.publish.mockReset().mockResolvedValue({ ...message, flags: MessageFlag.CROSSPOSTED });
});
afterEach(cleanup);

it('publishes an announcement once and updates the visible message', async () => {
  useMessageStore.getState().receive(message);
  render(<Row item={message} />);
  fireEvent.mouseEnter(screen.getByTestId('message'));
  fireEvent.click(screen.getByRole('button', { name: 'Publish announcement' }));
  await waitFor(() => expect(fixture.publish).toHaveBeenCalledWith('10', '30'));
  await waitFor(() => expect(useMessageStore.getState().timelines['10']?.byId['30']?.flags).toBe(MessageFlag.CROSSPOSTED));
});
