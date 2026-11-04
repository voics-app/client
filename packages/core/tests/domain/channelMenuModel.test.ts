import { describe, expect, it } from 'vitest';
import { buildChannelMenu } from '../../src/domain/channelMenuModel';
import { idsOf } from '../../src/domain/menuModel';

const base = { inGuild: true, canInvite: false, canManage: false, hasUnread: false, muted: false };

describe('buildChannelMenu pinning', () => {
  it('offers Pin, or Unpin when already pinned, in servers', () => {
    expect(idsOf(buildChannelMenu(base))).toContain('pin');
    const unpinned = idsOf(buildChannelMenu({ ...base, pinned: true }));
    expect(unpinned).toContain('unpin');
    expect(unpinned).not.toContain('pin');
  });
  it('disables Pin when the server limit is reached', () => {
    const pin = buildChannelMenu({ ...base, pinFull: true }).find((m) => m.kind === 'item' && m.id === 'pin');
    expect(pin).toMatchObject({ disabled: true });
  });
  it('does not offer pinning outside servers', () => {
    expect(idsOf(buildChannelMenu({ ...base, inGuild: false }))).not.toContain('pin');
  });
});
