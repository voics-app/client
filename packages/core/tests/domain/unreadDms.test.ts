import { describe, expect, it } from 'vitest';
import { ChannelType, type Channel } from '@discordy/core/contracts/rest';
import { MAX_RAIL_DMS, unreadDms } from '../../src/domain/unreadDms';

const dm = (id: string, last: string | null, type: number = ChannelType.DM) => ({ id, type, last_message_id: last, recipients: [] }) as unknown as Channel;
const notMuted = () => false;

describe('unreadDms', () => {
  it('lists conversations with counted messages, newest first', () => {
    const channels = { a: dm('1', '10'), b: dm('2', '30'), c: dm('3', '20') };
    const reads = { '1': { lastReadId: '5', mentionCount: 2 }, '2': { lastReadId: '5', mentionCount: 7 }, '3': { lastReadId: '20', mentionCount: 0 } };
    expect(unreadDms(channels, reads, notMuted).map((d) => [d.channel.id, d.count])).toEqual([['2', 7], ['1', 2]]);
  });

  it('shows at least 1 when the read position is behind but nothing was counted', () => {
    expect(unreadDms({ a: dm('1', '10') }, { '1': { lastReadId: '5', mentionCount: 0 } }, notMuted)[0]?.count).toBe(1);
  });

  it('leaves out never-opened chats with nothing counted, muted chats and server channels', () => {
    const server = { ...dm('3', '10', ChannelType.GUILD_TEXT), guild_id: 'g' } as Channel;
    const channels = { a: dm('1', '10'), b: dm('2', '10'), c: server };
    const reads = { '2': { lastReadId: '5', mentionCount: 3 }, '3': { lastReadId: '5', mentionCount: 3 } };
    expect(unreadDms(channels, reads, (c) => c.id === '2')).toEqual([]);
  });

  it('includes group conversations and keeps the list short', () => {
    const channels = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), dm(String(i + 1), String(100 + i), ChannelType.GROUP_DM)]));
    const reads = Object.fromEntries(Object.keys(channels).map((id) => [id, { lastReadId: '1', mentionCount: 1 }]));
    expect(unreadDms(channels, reads, notMuted)).toHaveLength(MAX_RAIL_DMS);
  });
});
