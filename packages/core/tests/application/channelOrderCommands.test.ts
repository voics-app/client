import { beforeEach, describe, expect, it, vi } from 'vitest';
import { guildChannels, sendChannelMoves } from '@discordy/core/application/channelOrderCommands';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { ChannelType, type GuildFull } from '@discordy/core/contracts/rest';

const channel = (id: string, position: number, extra: object = {}) => ({ id, type: ChannelType.GUILD_TEXT, guild_id: 'g1', name: id, position, delivery_mode: 'standard', ...extra });

beforeEach(() => {
  useGuildStore.getState().reset();
  useGuildStore.getState().hydrate([{ id: 'g1', name: 'g', icon: null, owner_id: 'o', roles: [], emojis: [], members: [], channels: [channel('a', 0), channel('b', 1), channel('t', 2, { type: ChannelType.PUBLIC_THREAD })] } as unknown as GuildFull], []);
});

describe('channel order commands', () => {
  it('lists the sidebar channels of a server, not its threads', () => {
    expect(guildChannels('g1').map((c) => c.id).sort()).toEqual(['a', 'b']);
  });

  it('shows moves at once and sends them in one request', async () => {
    const api = { reorderChannels: vi.fn(async () => undefined) };
    const pending = sendChannelMoves(api, 'g1', [{ id: 'a', position: 1 }, { id: 'b', position: 0 }]);
    expect(useGuildStore.getState().channels['a']?.position).toBe(1);
    await pending;
    expect(api.reorderChannels).toHaveBeenCalledWith('g1', [{ id: 'a', position: 1 }, { id: 'b', position: 0 }]);
  });

  it('puts the old order back and throws when the server refuses', async () => {
    const api = { reorderChannels: vi.fn(async () => Promise.reject(new Error('no'))) };
    await expect(sendChannelMoves(api, 'g1', [{ id: 'a', position: 5, parent_id: null }])).rejects.toThrow('no');
    expect(useGuildStore.getState().channels['a']?.position).toBe(0);
  });
});
