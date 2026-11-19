import type { GuildMeta } from '@discordy/core/application/stores/guildStore';
import { Permission } from '@discordy/core/contracts/permissions';
import type { Channel, Message } from '@discordy/core/contracts/rest';
import { channelAccess, dmAccess, messageActions } from '../../src/messages/messageAccess';

const BASIC = Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES | Permission.READ_MESSAGE_HISTORY | Permission.ADD_REACTIONS;
const role = (permissions: bigint) => ({ id: 'g1', name: '@everyone', color: 0, hoist: false, position: 0, permissions: String(permissions), managed: false, mentionable: false });
const guild = (permissions: bigint, owner = 'owner') => ({ id: 'g1', name: 'Home', icon: null, owner_id: owner, roles: [role(permissions)], emojis: [] }) as unknown as GuildMeta;
const channel = (extra: Partial<Channel> = {}) => ({ id: 'c1', type: 0, guild_id: 'g1', name: 'general', delivery_mode: 'standard', ...extra }) as Channel;
const msg = (authorId: string, extra: Partial<Message> = {}) => ({ id: 'm1', channel_id: 'c1', author: { id: authorId }, content: 'hi', ...extra }) as Message;
const access = (permissions: bigint, extra: Partial<Channel> = {}, owner?: string) =>
  channelAccess({ guild: guild(permissions, owner), channel: channel(extra), members: undefined, userId: 'me' });

describe('channelAccess', () => {
  it('allows sending, reacting and reading for a regular member', () => {
    expect(access(BASIC)).toEqual({ canSend: true, canReact: true, canCreatePoll: false, canReadHistory: true, canAttach: false, canManageMessages: false, canCreateThread: false, canManageThreads: false, canUseCommands: false, standard: true });
  });

  it('allows application commands with Use Application Commands, and always in a direct message', () => {
    expect(access(BASIC | Permission.USE_APPLICATION_COMMANDS).canUseCommands).toBe(true);
    expect(dmAccess(channel({ guild_id: null as never, type: 1 })).canUseCommands).toBe(true);
  });

  it('requires both poll and send permissions', () => {
    expect(access(BASIC).canCreatePoll).toBe(false);
    expect(access(BASIC | Permission.SEND_POLLS).canCreatePoll).toBe(true);
    expect(access(Permission.SEND_POLLS).canCreatePoll).toBe(false);
  });

  it('blocks sending when SEND_MESSAGES is missing', () => {
    expect(access(BASIC & ~Permission.SEND_MESSAGES).canSend).toBe(false);
  });

  it('blocks sending when the channel overwrite denies it for everyone', () => {
    const overwrite = { id: 'g1', type: 0 as const, allow: '0', deny: String(Permission.SEND_MESSAGES) };
    expect(access(BASIC, { permission_overwrites: [overwrite] }).canSend).toBe(false);
  });

  it('gives the owner everything', () => {
    const owner = access(0n, {}, 'me');
    expect(owner.canSend && owner.canManageMessages && owner.canReact).toBe(true);
  });

  it('marks channels that are not standard delivery', () => {
    expect(access(BASIC, { delivery_mode: 'ephemeral' }).standard).toBe(false);
  });
});

describe('thread permissions', () => {
  const THREADS = BASIC | Permission.CREATE_PUBLIC_THREADS;
  const thread = { id: 't1', type: 11, parent_id: 'c1' } as Partial<Channel>;

  it('may start a thread from a message in a channel with Create Public Threads, but not inside a thread', () => {
    expect(access(THREADS).canCreateThread).toBe(true);
    expect(access(BASIC).canCreateThread).toBe(false);
    expect(access(THREADS, thread).canCreateThread).toBe(false);
  });

  it('offers Create Thread in the message actions only then', () => {
    expect(messageActions(msg('x'), access(THREADS), 'me').thread).toBe(true);
    expect(messageActions(msg('x'), access(BASIC), 'me').thread).toBe(false);
    expect(messageActions(msg('x'), { ...access(THREADS), standard: false }, 'me').thread).toBe(false);
  });

  it('writes in a thread with Send Messages in Threads, not Send Messages', () => {
    expect(access(BASIC, thread).canSend).toBe(false);
    expect(access(BASIC | Permission.SEND_MESSAGES_IN_THREADS, thread).canSend).toBe(true);
    expect(access((BASIC | Permission.SEND_MESSAGES_IN_THREADS) & ~Permission.SEND_MESSAGES, thread).canSend).toBe(true);
  });

  it('takes a thread permission overwrites from its parent channel', () => {
    const deny = { id: 'g1', type: 0 as const, allow: '0', deny: String(Permission.SEND_MESSAGES_IN_THREADS) };
    const parent = channel({ permission_overwrites: [deny] });
    const input = { guild: guild(BASIC | Permission.SEND_MESSAGES_IN_THREADS), channel: channel(thread), members: undefined, userId: 'me' };
    expect(channelAccess(input).canSend).toBe(true);
    expect(channelAccess({ ...input, parent }).canSend).toBe(false);
  });

  it('lets Manage Threads write in a locked thread', () => {
    expect(access(BASIC | Permission.MANAGE_THREADS).canManageThreads).toBe(true);
    expect(access(BASIC).canManageThreads).toBe(false);
  });
});

describe('messageActions', () => {
  const mine = access(BASIC);

  it('offers edit and delete on own messages', () => {
    expect(messageActions(msg('me'), mine, 'me')).toMatchObject({ reply: true, edit: true, delete: true, react: true });
  });

  it('offers neither edit nor delete on other people messages without MANAGE_MESSAGES', () => {
    expect(messageActions(msg('other'), mine, 'me')).toMatchObject({ reply: true, edit: false, delete: false });
  });

  it('lets moderators delete but not edit other people messages', () => {
    const mod = access(BASIC | Permission.MANAGE_MESSAGES);
    expect(messageActions(msg('other'), mod, 'me')).toMatchObject({ edit: false, delete: true });
  });

  it('hides reply and react when the user cannot send or react', () => {
    const readOnly = access(Permission.VIEW_CHANNEL | Permission.READ_MESSAGE_HISTORY);
    expect(messageActions(msg('other'), readOnly, 'me')).toMatchObject({ reply: false, react: false });
  });

  it('offers nothing on messages that are still sending or failed', () => {
    const a = messageActions({ ...msg('me'), localState: 'failed' }, mine, 'me');
    expect(a).toEqual({ reply: false, edit: false, editAttachments: false, delete: false, react: false, copyText: false, copyLink: false, markUnread: false, pin: false, unpin: false, thread: false, blockAuthor: false, forward: false, report: false });
  });

  it('offers attachment editing only on your sent standard messages with files', () => {
    const attachments = [{ id: 'a', filename: 'photo.png', size: 1, url: 'https://cdn.test/photo' }];
    expect(messageActions(msg('me', { attachments }), mine, 'me').editAttachments).toBe(true);
    expect(messageActions(msg('other', { attachments }), access(BASIC | Permission.MANAGE_MESSAGES), 'me').editAttachments).toBe(false);
    expect(messageActions(msg('me', { attachments }), { ...mine, standard: false }, 'me').editAttachments).toBe(false);
    expect(messageActions(msg('me'), mine, 'me').editAttachments).toBe(false);
  });

  it('offers Copy Message Link and Mark Unread to everyone, and Pin only with Manage Messages', () => {
    expect(messageActions(msg('other'), mine, 'me')).toMatchObject({ copyLink: true, markUnread: true, pin: false, unpin: false });
    const mod = access(BASIC | Permission.MANAGE_MESSAGES);
    expect(messageActions(msg('other'), mod, 'me')).toMatchObject({ pin: true, unpin: false });
    expect(messageActions(msg('other', { pinned: true }), mod, 'me')).toMatchObject({ pin: false, unpin: true });
  });

  it('offers no pin in private channels', () => {
    const priv = access(BASIC | Permission.MANAGE_MESSAGES, { delivery_mode: 'ephemeral' });
    expect(messageActions(msg('other'), priv, 'me')).toMatchObject({ pin: false, unpin: false });
  });

  it('offers Delete on your own private messages only', () => {
    const priv = access(BASIC | Permission.MANAGE_MESSAGES, { delivery_mode: 'ephemeral' });
    expect(messageActions(msg('me'), priv, 'me').delete).toBe(true);
    expect(messageActions(msg('other'), priv, 'me').delete).toBe(false);
  });

  it('offers Copy Text only on messages that have text', () => {
    expect(messageActions(msg('me'), mine, 'me').copyText).toBe(true);
    expect(messageActions(msg('me', { content: '  ' }), mine, 'me').copyText).toBe(false);
  });
});

describe('dmAccess', () => {
  it('lets participants send, react and read, but never moderate', () => {
    expect(dmAccess(channel({ guild_id: null, type: 1 }))).toEqual({ canSend: true, canReact: true, canCreatePoll: true, canReadHistory: true, canAttach: true, canManageMessages: false, canCreateThread: false, canManageThreads: false, canUseCommands: true, standard: true });
  });

  it('marks private delivery as not standard', () => {
    expect(dmAccess(channel({ guild_id: null, type: 1, delivery_mode: 'p2p' })).standard).toBe(false);
  });
});

describe('blocking the author', () => {
  it('is offered for other people, not for yourself, bots or people already blocked', () => {
    expect(messageActions(msg('x'), access(BASIC), 'me').blockAuthor).toBe(true);
    expect(messageActions(msg('me'), access(BASIC), 'me').blockAuthor).toBe(false);
    expect(messageActions(msg('x', { author: { id: 'x', bot: true } as never }), access(BASIC), 'me').blockAuthor).toBe(false);
    expect(messageActions(msg('x'), access(BASIC), 'me', true).blockAuthor).toBe(false);
  });
});

describe('forwarding', () => {
  it('is offered for stored messages, not system messages, private chats or unsent ones', () => {
    expect(messageActions(msg('x', { type: 0 }), access(BASIC), 'me').forward).toBe(true);
    expect(messageActions(msg('x', { type: 7 }), access(BASIC), 'me').forward).toBe(false);
    expect(messageActions(msg('x', { type: 0 }), { ...access(BASIC), standard: false }, 'me').forward).toBe(false);
    expect(messageActions({ ...msg('x', { type: 0 }), localState: 'sending' } as never, access(BASIC), 'me').forward).toBe(false);
  });
});

describe('reporting the message', () => {
  it('is offered on other people\'s messages in every delivery mode, not on your own or unsent ones', () => {
    expect(messageActions(msg('x'), access(BASIC), 'me').report).toBe(true);
    expect(messageActions(msg('x'), access(BASIC, { delivery_mode: 'p2p' }), 'me').report).toBe(true);
    expect(messageActions(msg('me'), access(BASIC), 'me').report).toBe(false);
    expect(messageActions({ ...msg('x'), localState: 'sending' }, access(BASIC), 'me').report).toBe(false);
  });
});
