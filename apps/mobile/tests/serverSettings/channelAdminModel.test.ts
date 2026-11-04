import { ChannelType } from '@discordy/core/contracts/rest';
import { createChannelBody, normalizeChannelName } from '../../src/serverSettings/channelAdminModel';

describe('normalizeChannelName', () => {
  it('lower-cases a channel name and joins words with dashes', () => {
    expect(normalizeChannelName('  Game   Night ', false)).toBe('game-night');
  });

  it('keeps a category name as typed', () => {
    expect(normalizeChannelName('  Game Night ', true)).toBe('Game Night');
  });
});

describe('createChannelBody', () => {
  it('builds a text channel in a category with its delivery mode', () => {
    expect(createChannelBody({ name: 'Chat Room', type: ChannelType.GUILD_TEXT, parentId: 'cat', delivery: 'ephemeral' })).toEqual({ name: 'chat-room', type: ChannelType.GUILD_TEXT, parent_id: 'cat', delivery_mode: 'ephemeral' });
  });

  it('keeps voice channels standard, whatever delivery was chosen', () => {
    expect(createChannelBody({ name: 'Lobby', type: ChannelType.GUILD_VOICE, parentId: null, delivery: 'ephemeral' }).delivery_mode).toBe('standard');
  });

  it('never gives a category a parent', () => {
    expect(createChannelBody({ name: 'Games', type: ChannelType.GUILD_CATEGORY, parentId: 'cat', delivery: 'standard' })).toMatchObject({ name: 'Games', parent_id: null });
  });
});
