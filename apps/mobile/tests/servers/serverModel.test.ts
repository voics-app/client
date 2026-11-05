import type { GuildMeta } from '@discordy/core/application/stores/guildStore';
import { Permission } from '@discordy/core/contracts/permissions';
import { ChannelType, type Channel } from '@discordy/core/contracts/rest';
import { channelSections, channelsInSection, serverRows } from '../../src/servers/serverModel';

const ME = 'u1';
const EVERYONE = { id: 'g1', name: '@everyone', color: 0, hoist: false, position: 0, permissions: String(Permission.VIEW_CHANNEL), managed: false, mentionable: false };
const guild = { id: 'g1', name: 'Home', icon: null, owner_id: 'owner', roles: [EVERYONE], emojis: [] } as unknown as GuildMeta;

function channel(id: string, type: number, extra: Partial<Channel> = {}): Channel {
  return { id, type, guild_id: 'g1', name: id, delivery_mode: 'standard', position: 0, ...extra } as Channel;
}

const input = (list: Channel[]) => ({
  guild,
  channels: Object.fromEntries(list.map((c) => [c.id, c])),
  members: { [ME]: { user: { id: ME }, roles: [] } } as never,
  userId: ME,
});

describe('serverRows', () => {
  it('follows the stored order and skips unknown ids', () => {
    const other = { ...guild, id: 'g2', name: 'Work', icon: 'abc' } as GuildMeta;
    const rows = serverRows({ order: ['g2', 'gone', 'g1'], guilds: { g1: guild, g2: other } });
    expect(rows).toEqual([
      { id: 'g2', name: 'Work', icon: 'abc' },
      { id: 'g1', name: 'Home', icon: null },
    ]);
  });
});

describe('channelSections', () => {
  it('puts loose channels first, then categories in order with their children in order', () => {
    const sections = channelSections(
      input([
        channel('cat-b', ChannelType.GUILD_CATEGORY, { position: 2 }),
        channel('cat-a', ChannelType.GUILD_CATEGORY, { position: 1 }),
        channel('b2', ChannelType.GUILD_TEXT, { parent_id: 'cat-a', position: 2 }),
        channel('b1', ChannelType.GUILD_TEXT, { parent_id: 'cat-a', position: 1 }),
        channel('news', ChannelType.GUILD_ANNOUNCEMENT, { parent_id: 'cat-b' }),
        channel('welcome', ChannelType.GUILD_TEXT),
      ]),
    );
    expect(sections.map((s) => [s.title, s.channels.map((c) => c.id)])).toEqual([
      [null, ['welcome']],
      ['cat-a', ['b1', 'b2']],
      ['cat-b', ['news']],
    ]);
  });

  it('lists a channel once, whether or not its category exists', () => {
    const sections = channelSections(
      input([
        channel('cat', ChannelType.GUILD_CATEGORY, { name: 'Text Channels' }),
        channel('general', ChannelType.GUILD_TEXT, { parent_id: 'cat' }),
        channel('orphan', ChannelType.GUILD_TEXT, { parent_id: 'deleted-category' }),
      ]),
    );
    const ids = sections.flatMap((s) => s.channels.map((c) => c.id));
    expect(ids.sort()).toEqual(['general', 'orphan']);
    expect(sections.find((s) => s.id === 'cat')?.channels.map((c) => c.id)).toEqual(['general']);
  });

  it('lists every kind the desktop sidebar lists, but not threads or empty categories', () => {
    const sections = channelSections(
      input([
        channel('cat', ChannelType.GUILD_CATEGORY),
        channel('empty', ChannelType.GUILD_CATEGORY, { position: 5 }),
        channel('talk', ChannelType.GUILD_VOICE, { parent_id: 'cat', position: 1 }),
        channel('stage', ChannelType.GUILD_STAGE_VOICE, { parent_id: 'cat', position: 2 }),
        channel('ideas', ChannelType.GUILD_FORUM, { parent_id: 'cat', position: 3 }),
        channel('thread', ChannelType.PUBLIC_THREAD),
        channel('chat', ChannelType.GUILD_TEXT),
      ]),
    );
    expect(sections.map((s) => [s.title, s.channels.map((c) => c.id)])).toEqual([
      [null, ['chat']],
      ['cat', ['talk', 'stage', 'ideas']],
    ]);
  });

  it('hides channels the user may not view', () => {
    const hidden = channel('secret', ChannelType.GUILD_TEXT, {
      permission_overwrites: [{ id: 'g1', type: 0, allow: '0', deny: String(Permission.VIEW_CHANNEL) }],
    });
    const sections = channelSections(input([hidden, channel('open', ChannelType.GUILD_TEXT)]));
    expect(sections[0]?.channels.map((c) => c.id)).toEqual(['open']);
  });

  it('ignores channels of other servers', () => {
    const sections = channelSections(input([channel('x', ChannelType.GUILD_TEXT, { guild_id: 'other' })]));
    expect(sections).toEqual([]);
  });
});

describe('channelsInSection', () => {
  const text = channel('text', ChannelType.GUILD_TEXT, { last_message_id: '5' });
  const quiet = channel('quiet', ChannelType.GUILD_TEXT, { last_message_id: '5' });
  const voice = channel('voice', ChannelType.GUILD_VOICE);
  const empty = channel('empty', ChannelType.GUILD_VOICE);
  const all = [text, quiet, voice, empty];
  const base = {
    collapsed: true,
    activeId: null,
    reads: { text: { lastReadId: '5', mentionCount: 0 }, quiet: { lastReadId: '5', mentionCount: 0 } },
    settings: undefined,
    voiceStates: {},
    now: 0,
  };
  const inVoice = { g1: { u2: { user_id: 'u2', channel_id: 'voice', guild_id: 'g1' } } } as never;

  it('lists every channel while expanded', () => {
    expect(channelsInSection(all, { ...base, collapsed: false }).map((c) => c.id)).toEqual(['text', 'quiet', 'voice', 'empty']);
  });
  it('hides everything quiet while collapsed', () => {
    expect(channelsInSection(all, base)).toEqual([]);
  });
  it('keeps a voice channel with people in it, and only that one', () => {
    expect(channelsInSection(all, { ...base, voiceStates: inVoice }).map((c) => c.id)).toEqual(['voice']);
  });
  it('keeps the open channel, mentions and unread text channels', () => {
    expect(channelsInSection(all, { ...base, activeId: 'quiet' }).map((c) => c.id)).toEqual(['quiet']);
    expect(channelsInSection(all, { ...base, reads: { ...base.reads, text: { lastReadId: '5', mentionCount: 2 } } }).map((c) => c.id)).toEqual(['text']);
    expect(channelsInSection(all, { ...base, reads: { ...base.reads, quiet: { lastReadId: '1', mentionCount: 0 } } }).map((c) => c.id)).toEqual(['quiet']);
  });
});
