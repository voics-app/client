import { describe, expect, it } from 'vitest';
import { ChannelType } from '../../src/contracts/rest';
import { channelIcon, isVoiceKind } from '../../src/domain/channelKind';

describe('channelIcon', () => {
  it('maps every channel type the sidebar lists', () => {
    expect(channelIcon(ChannelType.GUILD_TEXT)).toBe('text');
    expect(channelIcon(ChannelType.GUILD_VOICE)).toBe('voice');
    expect(channelIcon(ChannelType.GUILD_STAGE_VOICE)).toBe('stage');
    expect(channelIcon(ChannelType.GUILD_ANNOUNCEMENT)).toBe('announcement');
    expect(channelIcon(ChannelType.GUILD_FORUM)).toBe('forum');
    expect(channelIcon(ChannelType.PUBLIC_THREAD)).toBe('thread');
  });

  it('treats voice and stage as voice kinds only', () => {
    expect(isVoiceKind('voice')).toBe(true);
    expect(isVoiceKind('stage')).toBe(true);
    expect(isVoiceKind('text')).toBe(false);
  });
});
