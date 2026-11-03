import { describe, expect, it } from 'vitest';
import { hasActivity, isPrivateChannel, offscreenMentions, visibleChannelIds, type ActivityFacts } from '@renderer/domain/channelActivity';
import { buildCategoryMenu, buildChannelMenu, channelLink, duplicateChannelBody } from '@renderer/domain/channelMenuModel';
import { idsOf, tidy, item, sep } from '@renderer/domain/menuModel';
import { buildMessageMenu, buildToolbar, type MessageMenuContext } from '@renderer/domain/messageMenuModel';
import { emptySettings, isChannelMutedDeep, MUTE_DURATIONS, withMute } from '@renderer/domain/notificationSettings';
import { DEFAULT_QUICK_REACTIONS, parseApiEmoji, quickReactions, recordReaction } from '@renderer/domain/quickReactions';
import type { Channel } from '@shared/contracts/rest';

const ctx = (over: Partial<MessageMenuContext> = {}): MessageMenuContext => ({
  developerMode: true,
  isMine: false,
  standard: true,
  canReact: true,
  canManageMessages: false,
  canCreateThread: false,
  forwardSupported: false,
  canSpeak: true,
  hasText: true,
  pinned: false,
  selection: '',
  canAddEmoji: false,
  quick: DEFAULT_QUICK_REACTIONS,
  ...over,
});
const msg = { kind: 'message' } as const;

describe('message menu', () => {
  it('offers the Discord entries a plain member gets on someone else message', () => {
    expect(idsOf(buildMessageMenu(ctx(), msg))).toEqual(['addReaction', 'react', 'react', 'react', 'react', 'reactMore', 'reply', 'copyText', 'markUnread', 'copyMessageLink', 'forwardSoon', 'reportSoon', 'speak', 'copyId']);
  });

  it('hides Forward (unsupported), Create Thread and Pin without permission, and Edit on others messages', () => {
    const ids = idsOf(buildMessageMenu(ctx(), msg));
    for (const hidden of ['forward', 'thread', 'pin', 'unpin', 'edit', 'delete']) expect(ids).not.toContain(hidden);
  });

  it('adds Edit and Delete for an own message, Pin/Unpin and Thread by permission', () => {
    const ids = idsOf(buildMessageMenu(ctx({ isMine: true, canManageMessages: true, canCreateThread: true, pinned: true }), msg));
    expect(ids).toEqual(expect.arrayContaining(['edit', 'unpin', 'thread', 'delete']));
    expect(ids).not.toContain('pin');
    expect(idsOf(buildMessageMenu(ctx({ canManageMessages: true }), msg))).toContain('pin');
  });

  it('shows Forward only when supported', () => {
    expect(idsOf(buildMessageMenu(ctx({ forwardSupported: true }), msg))).toContain('forward');
  });

  it('disables Forward with a hint for E2EE and P2P messages', () => {
    const entry = buildMessageMenu(ctx({ forwardSupported: true, standard: false }), msg).find((e) => e.kind === 'item' && e.id === 'forward');
    expect(entry).toMatchObject({ disabled: true });
    expect((entry as { hint?: string }).hint).toMatch(/end-to-end/i);
  });

  it('drops reaction, pin and thread entries for non-standard delivery but keeps Delete for own messages', () => {
    const ids = idsOf(buildMessageMenu(ctx({ standard: false, isMine: true, canManageMessages: true, canCreateThread: true }), msg));
    for (const hidden of ['addReaction', 'pin', 'thread', 'edit']) expect(ids).not.toContain(hidden);
    expect(ids).toContain('delete');
  });

  it('hides Add Reaction without ADD_REACTIONS, Copy Text without text and Speak without synthesis', () => {
    const ids = idsOf(buildMessageMenu(ctx({ canReact: false, hasText: false, canSpeak: false }), msg));
    for (const hidden of ['addReaction', 'copyText', 'speak']) expect(ids).not.toContain(hidden);
  });

  it('puts the quick emoji in the Add Reaction submenu', () => {
    const sub = buildMessageMenu(ctx(), msg)[0];
    expect(sub).toMatchObject({ kind: 'submenu', id: 'addReaction' });
    if (sub?.kind !== 'submenu') throw new Error('expected a submenu');
    const args = sub.items.filter((i) => i.kind === 'item' && i.id === 'react').map((i) => (i.kind === 'item' ? i.arg : ''));
    expect(args).toEqual(['👍', '❤️', '😂', '🎉']);
  });

  it('link target: Open Link and Copy Link first, then the message entries below a separator', () => {
    const menu = buildMessageMenu(ctx(), { kind: 'link', url: 'https://x.test' });
    expect(idsOf(menu).slice(0, 2)).toEqual(['openLink', 'copyLink']);
    expect(menu[2]).toEqual({ kind: 'separator' });
    expect(idsOf(menu)).toContain('reply');
  });

  it('image target: Copy Image, Save Image, Open Original, Copy Link', () => {
    const menu = buildMessageMenu(ctx(), { kind: 'image', url: 'u', openUrl: 'o', filename: 'a.png' });
    expect(idsOf(menu).slice(0, 4)).toEqual(['copyImage', 'saveImage', 'openLink', 'copyLink']);
    expect(menu.find((e) => e.kind === 'item' && e.id === 'openLink')).toMatchObject({ arg: 'o' });
  });

  it('emoji target: Copy Emoji Link, Add to Server only when permitted', () => {
    const emoji = { kind: 'emoji', id: '9', name: 'wave', url: 'u', animated: false } as const;
    expect(idsOf(buildMessageMenu(ctx(), emoji))[0]).toBe('copyLink');
    expect(idsOf(buildMessageMenu(ctx(), emoji))).not.toContain('addEmoji');
    expect(idsOf(buildMessageMenu(ctx({ canAddEmoji: true }), emoji)).slice(0, 2)).toEqual(['copyLink', 'addEmoji']);
  });

  it('selected text puts Copy and Search with Google first', () => {
    const ids = idsOf(buildMessageMenu(ctx({ selection: ' hello world ' }), msg));
    expect(ids.slice(0, 2)).toEqual(['copySelection', 'searchGoogle']);
    expect(buildMessageMenu(ctx({ selection: ' hello world ' }), msg)[1]).toMatchObject({ arg: 'hello world' });
    expect(idsOf(buildMessageMenu(ctx({ selection: '   ' }), msg))[0]).toBe('addReaction');
  });
});

describe('developer mode gate (client#89)', () => {
  it('hides every Copy ID entry unless developer mode is on', () => {
    const msg = { kind: 'message' } as const;
    expect(idsOf(buildMessageMenu(ctx({ developerMode: false }), msg))).not.toContain('copyId');
    expect(idsOf(buildMessageMenu(ctx({ developerMode: undefined }), msg))).not.toContain('copyId');
    const toolbar = { isMine: false, standard: true, canReact: true, canManageMessages: false, forwardSupported: false, pinned: false, quick: DEFAULT_QUICK_REACTIONS, shift: true };
    expect(buildToolbar({ ...toolbar, developerMode: false }).map((a) => a.id)).not.toContain('copyId');
    const channel = { inGuild: true, canInvite: true, canManage: true, hasUnread: true, muted: false };
    expect(idsOf(buildChannelMenu(channel))).not.toContain('copyId');
    expect(idsOf(buildChannelMenu({ ...channel, developerMode: true }))).toContain('copyId');
    const category = { canManage: true, hasUnread: true, muted: false, collapsed: false, hasOtherCategories: true };
    expect(idsOf(buildCategoryMenu(category))).not.toContain('copyId');
    expect(idsOf(buildCategoryMenu({ ...category, developerMode: true }))).toContain('copyId');
  });
});

describe('message toolbar', () => {
  const base = { isMine: false, standard: true, canReact: true, canManageMessages: false, forwardSupported: false, pinned: false, quick: DEFAULT_QUICK_REACTIONS, shift: false, developerMode: true };
  const ids = (o: Partial<typeof base> = {}) => buildToolbar({ ...base, ...o }).map((a) => a.id);

  it('shows four quick reactions, add reaction, reply and more', () => {
    expect(ids()).toEqual(['react', 'react', 'react', 'react', 'reactMore', 'reply', 'more']);
  });
  it('adds Edit on own messages', () => expect(ids({ isMine: true })).toContain('edit'));
  it('hides reactions without permission', () => expect(ids({ canReact: false })).toEqual(['reply', 'more']));
  it('Shift swaps in Copy ID, Pin and Delete (permission gated)', () => {
    expect(ids({ shift: true })).toEqual(['react', 'react', 'react', 'react', 'reactMore', 'copyId', 'more']);
    expect(ids({ shift: true, canManageMessages: true })).toEqual(expect.arrayContaining(['copyId', 'pin', 'delete']));
    expect(ids({ shift: true, isMine: true })).toContain('delete');
    expect(ids({ shift: true, canManageMessages: true, pinned: true })).toContain('unpin');
    expect(ids({ shift: true })).not.toContain('reply');
  });
});

describe('quick reactions', () => {
  it('falls back to the defaults and tops recents up to four without duplicates', () => {
    expect(quickReactions([]).map((e) => e.name)).toEqual(['👍', '❤️', '😂', '🎉']);
    expect(quickReactions([{ id: null, name: '🔥' }, { id: null, name: '👍' }]).map((e) => e.name)).toEqual(['🔥', '👍', '❤️', '😂']);
  });
  it('records most recent first, deduplicated and capped', () => {
    let r = [] as ReturnType<typeof recordReaction>;
    for (let i = 0; i < 12; i++) r = recordReaction(r, { id: null, name: `e${i}` });
    expect(r).toHaveLength(8);
    expect(r[0]!.name).toBe('e11');
    expect(recordReaction(r, { id: null, name: 'e5' })[0]!.name).toBe('e5');
    expect(recordReaction(r, { id: null, name: 'e5' }).filter((e) => e.name === 'e5')).toHaveLength(1);
  });
  it('parses custom api form', () => expect(parseApiEmoji('wave:123')).toEqual({ name: 'wave', id: '123' }));
});

describe('mute durations', () => {
  it('lists Discord durations', () => expect(MUTE_DURATIONS.map((d) => d.id)).toEqual(['15m', '1h', '3h', '8h', '24h', 'forever']));
  it('expires timed mutes and keeps forever mutes', () => {
    const s = withMute(emptySettings('g'), 'a', 60, 1000);
    expect(isChannelMutedDeep(s, { id: 'a' }, 1000 + 59_999)).toBe(true);
    expect(isChannelMutedDeep(s, { id: 'a' }, 1000 + 60_000)).toBe(false);
    const f = withMute(s, 'a', null, 5000);
    expect(isChannelMutedDeep(f, { id: 'a' }, 10 ** 15)).toBe(true);
    expect(isChannelMutedDeep(withMute(f, 'a', undefined, 0), { id: 'a' }, 0)).toBe(false);
  });
  it('a muted category mutes its channels', () => {
    const s = withMute(emptySettings('g'), 'cat', null, 0);
    expect(isChannelMutedDeep(s, { id: 'c', parent_id: 'cat' }, 1)).toBe(true);
    expect(isChannelMutedDeep(s, { id: 'c', parent_id: 'other' }, 1)).toBe(false);
  });
});

describe('channel menu', () => {
  const full = { inGuild: true, canInvite: true, canManage: true, hasUnread: true, muted: false, developerMode: true };
  it('manager with invite permission gets every entry', () => {
    const ids = idsOf(buildChannelMenu(full));
    expect(ids).toEqual(['markRead', 'invite', 'copyLink', 'mute', ...MUTE_DURATIONS.map(() => 'muteFor'), 'notifications', 'moveUp', 'moveDown', 'edit', 'duplicate', 'create', 'delete', 'copyId']);
  });
  it('hides management by MANAGE_CHANNELS and Invite by CREATE_INSTANT_INVITE independently', () => {
    const noManage = idsOf(buildChannelMenu({ ...full, canManage: false }));
    expect(noManage).toContain('invite');
    for (const h of ['moveUp', 'moveDown', 'edit', 'duplicate', 'create', 'delete']) expect(noManage).not.toContain(h);
    const noInvite = idsOf(buildChannelMenu({ ...full, canInvite: false }));
    expect(noInvite).not.toContain('invite');
    expect(noInvite).toContain('edit');
  });
  it('DM channels get no invite, link or management', () => {
    expect(idsOf(buildChannelMenu({ ...full, inGuild: false }))).toEqual(['markRead', 'mute', ...MUTE_DURATIONS.map(() => 'muteFor'), 'notifications', 'copyId']);
  });
  it('Mark as read is disabled without unreads and Mute becomes Unmute', () => {
    const m = buildChannelMenu({ ...full, hasUnread: false, muted: true });
    expect(m[0]).toMatchObject({ id: 'markRead', disabled: true });
    expect(idsOf(m)).toContain('unmute');
    expect(idsOf(m)).not.toContain('mute');
  });
  it('copy link uses the discordy scheme', () => {
    expect(channelLink('g', 'c')).toBe('discordy://channels/g/c');
    expect(channelLink(null, 'c', 'm')).toBe('discordy://channels/@me/c/m');
  });
  it('duplicate copies type, topic, slowmode, overwrites and parent', () => {
    const ch = { id: '1', type: 0, guild_id: 'g', name: 'general', topic: 't', parent_id: 'p', rate_limit_per_user: 5, nsfw: true, delivery_mode: 'standard', permission_overwrites: [{ id: 'g', type: 0, allow: '0', deny: '1024' }] } as unknown as Channel;
    expect(duplicateChannelBody(ch)).toMatchObject({ name: 'general-copy', type: 0, topic: 't', parent_id: 'p', rate_limit_per_user: 5, nsfw: true, permission_overwrites: [{ id: 'g', type: 0, allow: '0', deny: '1024' }] });
  });
});

describe('category menu', () => {
  const full = { canManage: true, hasUnread: true, muted: false, collapsed: false, hasOtherCategories: true, developerMode: true };
  it('manager entries', () => {
    expect(idsOf(buildCategoryMenu(full))).toEqual(['markRead', 'toggleCollapse', 'collapseAll', 'mute', ...MUTE_DURATIONS.map(() => 'muteFor'), 'notifications', 'moveUp', 'moveDown', 'edit', 'create', 'delete', 'copyId']);
  });
  it('disables Move up/down at the edges of the list', () => {
    const items = buildCategoryMenu({ ...full, canMoveUp: false }).filter((m) => m.kind === 'item');
    expect(items.find((m) => m.id === 'moveUp')?.disabled).toBe(true);
    expect(items.find((m) => m.id === 'moveDown')?.disabled).toBe(false);
  });
  it('member only gets read/collapse/mute/notifications/copy id', () => {
    const ids = idsOf(buildCategoryMenu({ ...full, canManage: false }));
    for (const h of ['edit', 'create', 'delete']) expect(ids).not.toContain(h);
    expect(ids).toContain('copyId');
  });
  it('labels follow the collapsed and muted state', () => {
    const m = buildCategoryMenu({ ...full, collapsed: true, muted: true, hasOtherCategories: false });
    expect(m.find((e) => e.kind === 'item' && e.id === 'toggleCollapse')).toMatchObject({ label: 'Expand Category' });
    expect(idsOf(m)).toContain('unmute');
    expect(idsOf(m)).not.toContain('collapseAll');
  });
});

describe('collapsed category visibility', () => {
  const f = (id: string, over: Partial<ActivityFacts> = {}): ActivityFacts => ({ id, muted: false, unread: false, mentions: 0, occupied: false, ...over });
  const kids = [f('quiet'), f('unread', { unread: true }), f('mentioned', { mentions: 2 }), f('mutedUnread', { unread: true, muted: true }), f('mutedMention', { muted: true, mentions: 1 }), f('voice', { occupied: true })];
  it('expanded shows everything', () => expect(visibleChannelIds(kids, false, null).size).toBe(6));
  it('collapsed keeps unread, mentioned, occupied and the active channel; hides quiet and muted-unread', () => {
    expect([...visibleChannelIds(kids, true, 'quiet')].sort()).toEqual(['mentioned', 'mutedMention', 'quiet', 'unread', 'voice']);
    expect([...visibleChannelIds(kids, true, null)].sort()).toEqual(['mentioned', 'mutedMention', 'unread', 'voice']);
  });
  it('hasActivity ignores muted unread but not muted mentions', () => {
    expect(hasActivity(f('a', { unread: true, muted: true }), null)).toBe(false);
    expect(hasActivity(f('a', { mentions: 1, muted: true }), null)).toBe(true);
  });
});

describe('offscreen mention pill', () => {
  const rows = [
    { id: 'a', top: -300, bottom: -280 },
    { id: 'b', top: -100, bottom: -80 },
    { id: 'c', top: 100, bottom: 120 },
    { id: 'd', top: 700, bottom: 720 },
    { id: 'e', top: 900, bottom: 920 },
  ];
  it('picks the nearest hidden row in each direction', () => {
    expect(offscreenMentions(rows, { top: 0, bottom: 600 })).toEqual({ above: 'b', below: 'd' });
  });
  it('is empty when everything is in view', () => {
    expect(offscreenMentions([rows[2]!], { top: 0, bottom: 600 })).toEqual({ above: null, below: null });
  });
});

describe('private channel marker', () => {
  it('detects an @everyone VIEW_CHANNEL deny only', () => {
    expect(isPrivateChannel({ guild_id: 'g', permission_overwrites: [{ id: 'g', type: 0, deny: '1024' }] })).toBe(true);
    expect(isPrivateChannel({ guild_id: 'g', permission_overwrites: [{ id: 'r', type: 0, deny: '1024' }] })).toBe(false);
    expect(isPrivateChannel({ guild_id: 'g', permission_overwrites: [{ id: 'g', type: 0, deny: '2048' }] })).toBe(false);
    expect(isPrivateChannel({ guild_id: null })).toBe(false);
  });
});

describe('tidy', () => {
  it('strips edge and doubled separators and empty submenus', () => {
    expect(tidy([sep(), item('a', 'A'), sep(), sep(), { kind: 'submenu', id: 's', label: 'S', items: [] }, item('b', 'B'), sep()]).map((e) => e.kind)).toEqual(['item', 'separator', 'item']);
  });
});
