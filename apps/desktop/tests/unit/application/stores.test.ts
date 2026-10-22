import { beforeEach, describe, expect, it } from 'vitest';
import { useMessageStore, type ChatMessage } from '@renderer/application/stores/messageStore';
import { useVoiceStore, usersInChannel } from '@renderer/application/stores/voiceStore';
import { useTypingStore, typingUsers, useReadStateStore } from '@renderer/application/stores/peopleStores';
import { useGuildStore } from '@renderer/application/stores/guildStore';

const msg = (id: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  channel_id: 'c',
  author: { id: 'u', username: 'u', global_name: null, avatar: null },
  content: id,
  timestamp: `2026-10-16T10:00:0${id.length}.000Z`,
  edited_timestamp: null,
  mention_everyone: false,
  mentions: [],
  mention_roles: [],
  attachments: [],
  embeds: [],
  pinned: false,
  type: 0,
  ...extra,
});

describe('messageStore', () => {
  beforeEach(() => useMessageStore.getState().reset());

  it('orders history oldest → newest and prepends older pages', () => {
    const s = useMessageStore.getState();
    s.setHistory('c', [msg('30'), msg('20')], { prepend: false, hasMoreBefore: true });
    s.setHistory('c', [msg('10')], { prepend: true, hasMoreBefore: false });
    const t = useMessageStore.getState().timelines.c!;
    expect(t.ids).toEqual(['10', '20', '30']);
    expect(t.hasMoreBefore).toBe(false);
  });

  it('keeps optimistic messages at the end until confirmed, and marks failures', () => {
    const s = useMessageStore.getState();
    s.setHistory('c', [msg('20')], { prepend: false, hasMoreBefore: false });
    s.addOptimistic(msg('n1', { nonce: 'n1' }));
    s.receive(msg('25'));
    expect(useMessageStore.getState().timelines.c!.ids).toEqual(['20', '25', 'n1']);
    s.failOptimistic('c', 'n1', 'offline');
    expect(useMessageStore.getState().timelines.c!.byId.n1!.localState).toBe('failed');
  });

  it('a refreshed history keeps pending optimistic sends', () => {
    const s = useMessageStore.getState();
    s.addOptimistic(msg('n2', { nonce: 'n2' }));
    s.setHistory('c', [msg('40')], { prepend: false, hasMoreBefore: true });
    expect(useMessageStore.getState().timelines.c!.ids).toEqual(['40', 'n2']);
  });
});

describe('voiceStore', () => {
  it('moves a user between channels and scopes', () => {
    const v = useVoiceStore.getState();
    const base = { session_id: 's', deaf: false, mute: false, self_deaf: false, self_mute: false, self_video: false, suppress: false };
    v.upsertState({ ...base, guild_id: 'g1', channel_id: 'a', user_id: 'u' });
    v.upsertState({ ...base, guild_id: 'g2', channel_id: 'b', user_id: 'u' });
    const states = useVoiceStore.getState().states;
    expect(usersInChannel(states, 'g1', 'a')).toHaveLength(0);
    expect(usersInChannel(states, 'g2', 'b')).toHaveLength(1);
  });

  it('clamps per-user volume to 0–200%', () => {
    useVoiceStore.getState().setUserVolume('u', 5);
    expect(useVoiceStore.getState().userVolumes.u).toBe(2);
  });
});

describe('typing and read state', () => {
  it('expires typing indicators', () => {
    useTypingStore.getState().start('c', 'u', 1000);
    expect(typingUsers(useTypingStore.getState().byChannel, 'c', null, 5000)).toEqual(['u']);
    expect(typingUsers(useTypingStore.getState().byChannel, 'c', null, 20_000)).toEqual([]);
  });

  it('never moves the read marker backwards', () => {
    const r = useReadStateStore.getState();
    r.markRead('c', '50');
    r.markRead('c', '40');
    expect(useReadStateStore.getState().byChannel.c!.lastReadId).toBe('50');
  });
});

describe('guildStore', () => {
  it('reorders guilds in the rail', () => {
    useGuildStore.setState({ order: ['a', 'b', 'c'], rail: ['a', 'b', 'c'].map((id) => ({ id: null, name: null, color: null, guild_ids: [id] })) });
    useGuildStore.getState().moveGuild('c', 0);
    expect(useGuildStore.getState().order).toEqual(['c', 'a', 'b']);
  });

  it('keeps the flat order in sync with folders and drops servers that are gone', () => {
    useGuildStore.setState({ guilds: { a: {} as never, b: {} as never, c: {} as never } });
    useGuildStore.getState().setRail([
      { id: 1, name: 'F', color: 1, guild_ids: ['c', 'a', 'zz'] },
      { id: null, name: null, color: null, guild_ids: ['b'] },
    ]);
    expect(useGuildStore.getState().order).toEqual(['c', 'a', 'b']);
    useGuildStore.getState().removeGuild('a');
    expect(useGuildStore.getState().rail[0]!.guild_ids).toEqual(['c']);
  });
});
