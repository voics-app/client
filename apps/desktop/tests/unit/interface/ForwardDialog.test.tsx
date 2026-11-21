// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useClosedDmStore } from '@discordy/core/application/stores/closedDmStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import { ChannelType, type User } from '@discordy/core/contracts/rest';
import { useConnectionStore } from '@renderer/interface/app/connectionStore';
import { ForwardDialog } from '@renderer/interface/features/chat/ForwardDialog';

const fixture = vi.hoisted(() => ({ forwardMessage: vi.fn() }));
vi.mock('@renderer/interface/app/actions', () => ({ forwardMessage: fixture.forwardMessage }));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ privacy: { sender: { resolveMode: () => 'standard' } } }) }));

const message = { id: '100', channel_id: '101', guild_id: '102', content: 'A message to forward', attachments: [] } as unknown as ChatMessage;
const recipient = (avatar: string | null) => ({ id: '202', username: 'sam', global_name: 'Sam Example', avatar }) as User;

beforeEach(() => {
  fixture.forwardMessage.mockReset().mockResolvedValue(true);
  useGuildStore.getState().reset();
  useClosedDmStore.setState({ closed: {} });
  useUiStore.setState({ dialog: { kind: 'forward', message } });
  useConnectionStore.setState({ cdnUrl: 'https://cdn.example.invalid' });
});
afterEach(cleanup);

describe('ForwardDialog recipient avatars', () => {
  it.each([['global-avatar', 'png'], ['a_global-avatar', 'gif']])('loads %s by user ID and still forwards to the DM channel', async (hash, extension) => {
    useGuildStore.setState({ channels: { '303': { id: '303', type: ChannelType.DM, delivery_mode: 'standard', recipients: [recipient(hash)] } } });
    render(<ForwardDialog message={message} />);
    const target = screen.getByRole('button', { name: 'Send to Sam Example' });
    expect(target.closest('.forward-row')?.querySelector('img')?.getAttribute('src')).toBe(`https://cdn.example.invalid/avatars/202/${hash}.${extension}?size=128`);
    fireEvent.click(target);
    await waitFor(() => expect(fixture.forwardMessage).toHaveBeenCalledWith(message, '303', ''));
    await waitFor(() => expect(useUiStore.getState().dialog).toBeNull());
  });

  it('keeps initials when the recipient has no global avatar', () => {
    useGuildStore.setState({ channels: { '303': { id: '303', type: ChannelType.DM, delivery_mode: 'standard', recipients: [recipient(null)] } } });
    render(<ForwardDialog message={message} />);
    const row = screen.getByRole('button', { name: 'Send to Sam Example' }).closest('.forward-row');
    expect(row?.querySelector('img')).toBeNull();
    expect(row?.querySelector('.avatar-face')?.textContent).toBe('SE');
  });
});
