import { describe, expect, it } from 'vitest';
import { canForward, forwardBody, forwardSnapshot, forwardTargets, isForward } from '@renderer/domain/forward';
import { ALL_PERMISSIONS, Permission } from '@shared/contracts/permissions';
import type { Channel } from '@shared/contracts/rest';

const user = (id: string) => ({ id, username: id, global_name: null, avatar: null });
const dm = (id: string, extra: Partial<Channel> = {}): Channel => ({ id, type: 1, delivery_mode: 'standard', recipients: [user(`u${id}`)], last_message_id: id, ...extra });
const text = (id: string, guild: string, name: string, position = 0): Channel => ({ id, type: 0, guild_id: guild, name, position, delivery_mode: 'standard' });

const base = (channels: Channel[], over: Partial<Parameters<typeof forwardTargets>[0]> = {}) => ({
  channels: Object.fromEntries(channels.map((c) => [c.id, c])),
  guilds: { g1: { name: 'Home' } },
  closed: {},
  query: '',
  hasAttachments: false,
  dmName: (c: Channel) => c.recipients?.[0]?.username ?? 'x',
  modeOf: (c: Channel) => c.delivery_mode,
  permissionsOf: () => ALL_PERMISSIONS,
  ...over,
});

describe('forward targets', () => {
  it('lists recent DMs first, then sendable channels', () => {
    const list = forwardTargets(base([text('10', 'g1', 'general'), dm('100000000000000000'), dm('200000000000000000')]));
    expect(list.map((t) => [t.kind, t.id])).toEqual([['dm', '200000000000000000'], ['dm', '100000000000000000'], ['channel', '10']]);
  });

  it('disables E2EE and P2P chats with a reason', () => {
    const list = forwardTargets(base([dm('1', { delivery_mode: 'ephemeral' }), dm('2', { delivery_mode: 'p2p' }), dm('3')]));
    expect(list.filter((t) => t.disabledReason).map((t) => t.id).sort()).toEqual(['1', '2']);
  });

  it('hides channels without SEND_MESSAGES, and without ATTACH_FILES when the message has files', () => {
    const channels = [text('10', 'g1', 'open'), text('11', 'g1', 'readonly'), text('12', 'g1', 'noFiles')];
    const permissionsOf = (c: Channel) => (c.id === '11' ? Permission.VIEW_CHANNEL : c.id === '12' ? Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES : ALL_PERMISSIONS);
    expect(forwardTargets(base(channels, { permissionsOf })).map((t) => t.id)).toEqual(['10', '12']);
    expect(forwardTargets(base(channels, { permissionsOf, hasAttachments: true })).map((t) => t.id)).toEqual(['10']);
  });

  it('filters by name or server name', () => {
    const channels = [text('10', 'g1', 'general'), text('11', 'g1', 'random'), dm('100')];
    expect(forwardTargets(base(channels, { query: 'rand' })).map((t) => t.id)).toEqual(['11']);
    expect(forwardTargets(base(channels, { query: 'home' })).map((t) => t.id)).toEqual(['10', '11']);
  });
});

describe('forward message helpers', () => {
  it('builds a FORWARD reference to the source', () => {
    expect(forwardBody({ id: '5', channel_id: '6', guild_id: '7' }, '  fyi ', 'n')).toEqual({ content: 'fyi', nonce: 'n', message_reference: { type: 1, message_id: '5', channel_id: '6', guild_id: '7' } });
    expect(forwardBody({ id: '5', channel_id: '6', guild_id: null }, '', 'n').message_reference).not.toHaveProperty('guild_id');
  });

  it('only stored, user-authored messages can be forwarded', () => {
    expect(canForward({ type: 0, flags: 0 }, 'standard')).toBe(true);
    expect(canForward({ type: 19 }, undefined)).toBe(true);
    expect(canForward({ type: 0 }, 'ephemeral')).toBe(false);
    expect(canForward({ type: 6 }, 'standard')).toBe(false);
    expect(canForward({ type: 0, flags: 64 }, 'standard')).toBe(false);
  });

  it('reads the snapshot only from forward references', () => {
    const snapshot = { message: { content: 'a', timestamp: 't', edited_timestamp: null, mentions: [], mention_roles: [], attachments: [], embeds: [], type: 0 } };
    expect(isForward({ message_reference: { type: 1, message_id: '1' } })).toBe(true);
    expect(isForward({ message_reference: { message_id: '1' } })).toBe(false);
    expect(forwardSnapshot({ message_reference: { type: 1, message_id: '1' }, message_snapshots: [snapshot] })?.content).toBe('a');
    expect(forwardSnapshot({ message_reference: { message_id: '1' }, message_snapshots: [snapshot] })).toBeNull();
  });
});
