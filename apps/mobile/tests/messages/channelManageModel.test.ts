import { Permission } from '@discordy/core/contracts/permissions';
import { ChannelType, type Channel } from '@discordy/core/contracts/rest';
import { channelManageEntries } from '../../src/messages/channelManageModel';

const channel = (extra: Partial<Channel> = {}) => ({ id: 'c1', type: ChannelType.GUILD_TEXT, guild_id: 'g1', nsfw: false, name: 'general', ...extra }) as Channel;

describe('channelManageEntries', () => {
  it('offers edit and delete in a server channel with Manage Channels', () => {
    expect(channelManageEntries(channel(), Permission.MANAGE_CHANNELS)).toEqual({ guildId: 'g1', edit: true, delete: true });
  });

  it('offers nothing without Manage Channels, in a DM, in a thread or for a missing channel', () => {
    expect(channelManageEntries(channel(), Permission.MANAGE_GUILD).edit).toBe(false);
    expect(channelManageEntries(channel({ guild_id: null }), Permission.MANAGE_CHANNELS).edit).toBe(false);
    expect(channelManageEntries(channel({ type: ChannelType.PUBLIC_THREAD }), Permission.MANAGE_CHANNELS).edit).toBe(false);
    expect(channelManageEntries(undefined, Permission.MANAGE_CHANNELS).edit).toBe(false);
  });
});
