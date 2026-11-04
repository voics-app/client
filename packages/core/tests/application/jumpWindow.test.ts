import { beforeEach, describe, expect, it } from 'vitest';
import { useMessageStore, type ChatMessage } from '../../src/application/stores/messageStore';
import { useReadStateStore } from '../../src/application/stores/peopleStores';
import { useReadNavStore } from '../../src/application/stores/readNavStore';

const msg = (id: string): ChatMessage => ({
  id,
  channel_id: 'c',
  author: { id: 'u', username: 'u', global_name: null, avatar: null },
  content: id,
  timestamp: '2026-10-16T10:00:00.000Z',
  edited_timestamp: null,
  mention_everyone: false,
  mentions: [],
  mention_roles: [],
  attachments: [],
  embeds: [],
  pinned: false,
  type: 0,
});

describe('detached timeline window (jump to message)', () => {
  beforeEach(() => useMessageStore.getState().reset());

  it('replaces the window around a target and ignores live messages until it reaches the present', () => {
    const s = useMessageStore.getState();
    s.setHistory('c', [msg('90'), msg('100')], { prepend: false, hasMoreBefore: true });
    s.setHistory('c', [msg('10'), msg('20')], { prepend: false, hasMoreBefore: true, hasMoreAfter: true });
    expect(useMessageStore.getState().timelines.c!.ids).toEqual(['10', '20']);
    s.receive(msg('200'));
    expect(useMessageStore.getState().timelines.c!.ids).toEqual(['10', '20']);
    s.setHistory('c', [msg('30')], { prepend: false, append: true, hasMoreBefore: true, hasMoreAfter: false });
    const t = useMessageStore.getState().timelines.c!;
    expect(t.ids).toEqual(['10', '20', '30']);
    expect(t.hasMoreAfter).toBe(false);
    expect(t.hasMoreBefore).toBe(true);
    s.receive(msg('200'));
    expect(useMessageStore.getState().timelines.c!.ids).toEqual(['10', '20', '30', '200']);
  });

  it('prepending keeps the detached flag', () => {
    const s = useMessageStore.getState();
    s.setHistory('c', [msg('20')], { prepend: false, hasMoreBefore: true, hasMoreAfter: true });
    s.setHistory('c', [msg('10')], { prepend: true, hasMoreBefore: false });
    expect(useMessageStore.getState().timelines.c!.hasMoreAfter).toBe(true);
  });
});

describe('read position', () => {
  it('setPosition moves the marker backwards and sets the mention count', () => {
    useReadStateStore.getState().reset();
    useReadStateStore.getState().markRead('c', '500');
    useReadStateStore.getState().setPosition('c', '300', 2);
    expect(useReadStateStore.getState().byChannel.c).toEqual({ lastReadId: '300', mentionCount: 2 });
  });
});

describe('readNavStore', () => {
  it('captures the anchor once per visit and releases it on leave', () => {
    const s = useReadNavStore.getState();
    s.captureAnchor('c', '10');
    s.captureAnchor('c', '99');
    expect(useReadNavStore.getState().anchors.c).toBe('10');
    s.dismissBar('c');
    s.setAnchor('c', '5');
    expect(useReadNavStore.getState().barDismissed.c).toBe(false);
    s.releaseAnchor('c');
    expect('c' in useReadNavStore.getState().anchors).toBe(false);
  });

  it('keeps one pending jump and consumes it by id', () => {
    const s = useReadNavStore.getState();
    s.requestJump('c', '7');
    const id = useReadNavStore.getState().jump!.id;
    s.consumeJump(id + 1);
    expect(useReadNavStore.getState().jump).not.toBeNull();
    s.consumeJump(id);
    expect(useReadNavStore.getState().jump).toBeNull();
  });
});
