import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteGuild, leaveGuild, markChannelRead, markGuildRead, saveRail } from '@discordy/core/application/guildCommands';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useReadStateStore } from '@discordy/core/application/stores/peopleStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { ChannelType, type GuildFull } from '@discordy/core/contracts/rest';

const channel = (id: string, type: number, last: string | null) => ({ id, type, guild_id: 'g1', name: id, position: 0, delivery_mode: 'standard', last_message_id: last });
const guild = (id: string, channels: object[] = []) => ({ id, name: id, icon: null, owner_id: 'o', roles: [], emojis: [], members: [], channels }) as unknown as GuildFull;

describe('guild commands', () => {
  beforeEach(() => {
    useGuildStore.getState().reset();
    useReadStateStore.getState().reset();
    useSessionStore.getState().reset();
  });

  it('marks a channel read once and tells the server', () => {
    useGuildStore.getState().hydrate([guild('g1', [channel('c1', ChannelType.GUILD_TEXT, '50')])], []);
    const api = { ack: vi.fn(async () => undefined) };
    markChannelRead(api, 'c1');
    markChannelRead(api, 'c1');
    expect(useReadStateStore.getState().byChannel['c1']?.lastReadId).toBe('50');
    expect(api.ack).toHaveBeenCalledTimes(1);
    expect(api.ack).toHaveBeenCalledWith('c1', '50');
  });

  it('does nothing for a channel without messages', () => {
    useGuildStore.getState().hydrate([guild('g1', [channel('c1', ChannelType.GUILD_TEXT, null)])], []);
    const api = { ack: vi.fn(async () => undefined) };
    markChannelRead(api, 'c1');
    expect(api.ack).not.toHaveBeenCalled();
  });

  it('marks only the text channels of the server read', () => {
    useGuildStore.getState().hydrate([guild('g1', [channel('t', ChannelType.GUILD_TEXT, '9'), channel('v', ChannelType.GUILD_VOICE, '8')])], []);
    const api = { ack: vi.fn(async () => undefined) };
    markGuildRead(api, 'g1');
    expect(api.ack.mock.calls).toEqual([['t', '9']]);
  });

  it('saves the rail at once and puts the old one back, with the error, when the save fails', async () => {
    useGuildStore.getState().hydrate([guild('a'), guild('b')], []);
    const before = useGuildStore.getState().rail;
    const flipped = [before[1]!, before[0]!];
    const api = { updateSettings: vi.fn(async () => Promise.reject(new Error('offline'))) };
    const pending = saveRail(api as never, flipped);
    expect(useGuildStore.getState().rail).toEqual(flipped);
    await expect(pending).rejects.toThrow('offline');
    expect(useGuildStore.getState().rail).toEqual(before);
  });

  it('syncs the rail and the flat order together', async () => {
    useGuildStore.getState().hydrate([guild('a'), guild('b')], []);
    const flipped = [useGuildStore.getState().rail[1]!, useGuildStore.getState().rail[0]!];
    const api = { updateSettings: vi.fn(async () => ({})) };
    await saveRail(api as never, flipped);
    expect(api.updateSettings).toHaveBeenCalledWith({ guild_folders: flipped, guild_positions: ['b', 'a'] });
  });

  it('leaves a server as yourself and forgets it', async () => {
    useSessionStore.setState({ user: { id: 'me' } as never });
    useGuildStore.getState().hydrate([guild('g1')], []);
    const api = { kickMember: vi.fn(async () => undefined) };
    await leaveGuild(api, 'g1');
    expect(api.kickMember).toHaveBeenCalledWith('g1', 'me');
    expect(useGuildStore.getState().guilds['g1']).toBeUndefined();
  });

  it('keeps the server when leaving or deleting fails', async () => {
    useSessionStore.setState({ user: { id: 'me' } as never });
    useGuildStore.getState().hydrate([guild('g1')], []);
    await expect(leaveGuild({ kickMember: vi.fn(async () => Promise.reject(new Error('no'))) }, 'g1')).rejects.toThrow('no');
    await expect(deleteGuild({ deleteGuild: vi.fn(async () => Promise.reject(new Error('no'))) }, 'g1')).rejects.toThrow('no');
    expect(useGuildStore.getState().guilds['g1']).toBeDefined();
  });

  it('deletes a server and forgets it', async () => {
    useGuildStore.getState().hydrate([guild('g1')], []);
    const api = { deleteGuild: vi.fn(async () => undefined) };
    await deleteGuild(api, 'g1');
    expect(api.deleteGuild).toHaveBeenCalledWith('g1');
    expect(useGuildStore.getState().guilds['g1']).toBeUndefined();
  });
});
