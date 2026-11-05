import { beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDm, leaveGroupDm, openDm, setDmPinned } from '@discordy/core/application/dmCommands';
import { useClosedDmStore } from '@discordy/core/application/stores/closedDmStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { ChannelType, type Channel } from '@discordy/core/contracts/rest';

const dm = (id: string, extra: Partial<Channel> = {}) => ({ id, type: ChannelType.DM, delivery_mode: 'standard', recipients: [], ...extra }) as Channel;
const pins = () => useSessionStore.getState().settings.pinned_dm_channel_ids;

describe('dm commands', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    useGuildStore.getState().reset();
    useClosedDmStore.setState({ closed: {} });
  });

  it('pins at once, syncs, and keeps pins in order', async () => {
    const api = { updateSettings: vi.fn(async () => ({})) };
    expect(await setDmPinned(api as never, 'a', true)).toBe(true);
    expect(await setDmPinned(api as never, 'b', true)).toBe(true);
    expect(pins()).toEqual(['a', 'b']);
    expect(api.updateSettings).toHaveBeenLastCalledWith({ pinned_dm_channel_ids: ['a', 'b'] });
    expect(await setDmPinned(api as never, 'a', false)).toBe(true);
    expect(pins()).toEqual(['b']);
  });

  it('does nothing past five pins or for a pin that is already there', async () => {
    const api = { updateSettings: vi.fn(async () => ({})) };
    for (const id of ['1', '2', '3', '4', '5']) await setDmPinned(api as never, id, true);
    api.updateSettings.mockClear();
    expect(await setDmPinned(api as never, '6', true)).toBe(false);
    expect(await setDmPinned(api as never, '5', true)).toBe(false);
    expect(api.updateSettings).not.toHaveBeenCalled();
  });

  it('undoes the pin when the save fails', async () => {
    const api = { updateSettings: vi.fn(async () => Promise.reject(new Error('offline'))) };
    await expect(setDmPinned(api as never, 'a', true)).rejects.toThrow('offline');
    expect(pins()).toEqual([]);
  });

  it('closes a DM at its last message and unpins it', async () => {
    useGuildStore.getState().upsertChannel(dm('a', { last_message_id: '77' }));
    useSessionStore.getState().setSettings({ pinned_dm_channel_ids: ['a'] });
    const api = { updateSettings: vi.fn(async () => ({})) };
    await closeDm(api as never, 'a');
    expect(useClosedDmStore.getState().closed).toEqual({ a: '77' });
    expect(pins()).toEqual([]);
  });

  it('keeps a DM open when unpinning it fails', async () => {
    useGuildStore.getState().upsertChannel(dm('a'));
    useSessionStore.getState().setSettings({ pinned_dm_channel_ids: ['a'] });
    await expect(closeDm({ updateSettings: vi.fn(async () => Promise.reject(new Error('offline'))) } as never, 'a')).rejects.toThrow();
    expect(useClosedDmStore.getState().closed).toEqual({});
  });

  it('opens a DM, lists it and reopens it if it was closed', async () => {
    useClosedDmStore.getState().close('a', '5');
    const api = { openPrivateChannel: vi.fn(async (_ids: string[]) => dm('a')) };
    const channel = await openDm(api, ['u2']);
    expect(api.openPrivateChannel).toHaveBeenCalledWith(['u2']);
    expect(channel.id).toBe('a');
    expect(useGuildStore.getState().channels['a']).toBeDefined();
    expect(useClosedDmStore.getState().closed).toEqual({});
  });

  it('leaves a group and forgets it', async () => {
    useGuildStore.getState().upsertChannel(dm('g', { type: ChannelType.GROUP_DM }));
    const api = { removeGroupRecipient: vi.fn(async () => undefined) };
    await leaveGroupDm(api, 'g');
    expect(api.removeGroupRecipient).toHaveBeenCalledWith('g', '@me');
    expect(useGuildStore.getState().channels['g']).toBeUndefined();
  });
});
