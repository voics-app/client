import { describe, expect, it } from 'vitest';
import { canEditTopic, canUnpin, headerButtons, normalizeTopic, TOPIC_MAX_LENGTH } from '@discordy/core/domain/chatHeader';
import { ALL_PERMISSIONS, Permission } from '@discordy/core/contracts/permissions';
import { ChannelType } from '@discordy/core/contracts/rest';

const text = { type: ChannelType.GUILD_TEXT, guild_id: 'g' };
const dm = { type: ChannelType.DM, guild_id: null, recipients: [{ id: 'u' }] } as never;

describe('topic rules', () => {
  it('needs MANAGE_CHANNELS in a server and never in a DM', () => {
    expect(canEditTopic(text, Permission.MANAGE_CHANNELS)).toBe(true);
    expect(canEditTopic(text, Permission.MANAGE_MESSAGES)).toBe(false);
    expect(canEditTopic(dm, ALL_PERMISSIONS)).toBe(false);
  });
  it('trims, clears on empty and rejects over the limit', () => {
    expect(normalizeTopic('  hi  ')).toBe('hi');
    expect(normalizeTopic('   ')).toBeNull();
    expect(normalizeTopic('x'.repeat(TOPIC_MAX_LENGTH))).toHaveLength(TOPIC_MAX_LENGTH);
    expect(normalizeTopic('x'.repeat(TOPIC_MAX_LENGTH + 1))).toBeUndefined();
  });
});

describe('pin rules', () => {
  it('unpin needs MANAGE_MESSAGES in a server, anyone in a DM', () => {
    expect(canUnpin(text, 0n)).toBe(false);
    expect(canUnpin(text, Permission.MANAGE_MESSAGES)).toBe(true);
    expect(canUnpin(dm, 0n)).toBe(true);
  });
});

describe('header buttons', () => {
  it('1:1 DMs get video call, add friends and profile, and no member list', () => {
    expect(headerButtons(dm)).toMatchObject({ call: true, videoCall: true, addFriends: true, profile: true, members: false });
  });
  it('group DMs have no profile panel', () => {
    expect(headerButtons({ type: ChannelType.GROUP_DM, recipients: [{ id: 'a' }, { id: 'b' }] } as never).profile).toBe(false);
  });
  it('server channels get the member list and, until api#34, no threads button', () => {
    expect(headerButtons(text as never)).toMatchObject({ members: true, call: false, addFriends: false, threads: false });
  });
});
