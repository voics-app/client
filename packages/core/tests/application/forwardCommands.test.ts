import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forwardMessage, permissionsInChannel } from '@discordy/core/application/forwardCommands';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useMessageStore } from '@discordy/core/application/stores/messageStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { ALL_PERMISSIONS, Permission } from '@discordy/core/contracts/permissions';
import { ChannelType, type Channel, type GuildFull, type Message } from '@discordy/core/contracts/rest';

const role = { id: 'g1', name: '@everyone', color: 0, hoist: false, position: 0, permissions: String(Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES), managed: false, mentionable: false };
const channel = (extra: Partial<Channel> = {}) => ({ id: 'c1', type: ChannelType.GUILD_TEXT, guild_id: 'g1', name: 'general', position: 0, delivery_mode: 'standard', ...extra }) as Channel;

beforeEach(() => {
  useGuildStore.getState().reset();
  useMessageStore.getState().reset();
  useSessionStore.getState().reset();
  useSessionStore.setState({ user: { id: 'me' } as never });
  useGuildStore.getState().hydrate([{ id: 'g1', name: 'g', icon: null, owner_id: 'o', roles: [role], emojis: [], members: [{ user: { id: 'me' }, roles: [] }], channels: [channel(), channel({ id: 'locked', permission_overwrites: [{ id: 'g1', type: 0, allow: '0', deny: String(Permission.SEND_MESSAGES) }] })] } as unknown as GuildFull], []);
});

describe('permissionsInChannel', () => {
  it('applies the channel overwrites to the server permissions', () => {
    const channels = useGuildStore.getState().channels;
    expect(permissionsInChannel(channels['c1']!) & Permission.SEND_MESSAGES).toBe(Permission.SEND_MESSAGES);
    expect(permissionsInChannel(channels['locked']!) & Permission.SEND_MESSAGES).toBe(0n);
  });

  it('allows everything in a direct message', () => {
    expect(permissionsInChannel({ id: 'd', type: ChannelType.DM } as Channel)).toBe(ALL_PERMISSIONS);
  });
});

describe('forwardMessage', () => {
  const original = { id: '5', channel_id: 'c1', guild_id: 'g1' } as Message;

  it('sends a forward reference with the comment and shows the copy in the target', async () => {
    const sent = { id: '9', channel_id: 'locked', author: { id: 'me' }, content: 'look', timestamp: new Date().toISOString(), attachments: [], embeds: [], mentions: [], mention_roles: [], mention_everyone: false, pinned: false, type: 0 } as unknown as Message;
    const api = { sendMessage: vi.fn(async () => sent) };
    await forwardMessage(api, original, 'locked', ' look ');
    expect(api.sendMessage).toHaveBeenCalledWith('locked', expect.objectContaining({ content: 'look', message_reference: { type: 1, message_id: '5', channel_id: 'c1', guild_id: 'g1' } }));
    expect(useMessageStore.getState().timelines['locked']?.byId['9']).toBeTruthy();
  });

  it('throws when the server refuses and shows nothing', async () => {
    const api = { sendMessage: vi.fn(async () => Promise.reject(new Error('no'))) };
    await expect(forwardMessage(api, original, 'c1', '')).rejects.toThrow('no');
    expect(useMessageStore.getState().timelines['c1']).toBeUndefined();
  });
});
