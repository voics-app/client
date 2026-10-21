import { ArrowDown, ArrowUp, ChatCircleDots, WarningCircle } from '@phosphor-icons/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { PENDING_TTL_MS, useInteractionStore, type PendingInteraction } from '@renderer/application/stores/interactionStore';
import { useMessageStore, type ChatMessage } from '@renderer/application/stores/messageStore';
import { useReadStateStore } from '@renderer/application/stores/peopleStores';
import { useReadNavStore } from '@renderer/application/stores/readNavStore';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { groupMessages } from '@renderer/domain/messageGrouping';
import { firstUnreadMessageId, isUnread, unreadBar } from '@renderer/domain/unread';
import { jumpToFirstUnread, markChannelRead, reportError } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { formatDay } from '../../shared/hooks/useNow';
import { useRovingFocus } from '../../shared/hooks/useRovingFocus';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { EmptyState, Skeleton } from '../../shared/ui/Misc';
import { Spinner } from '../../shared/ui/Spinner';
import { MessageItem } from './MessageItem';

type Row =
  | { kind: 'start'; key: string }
  | { kind: 'day'; key: string; label: string }
  | { kind: 'new'; key: string }
  | { kind: 'message'; key: string; message: ChatMessage; startsGroup: boolean }
  | { kind: 'thinking'; key: string; pending: PendingInteraction };

const BOTTOM_THRESHOLD = 80;

function formatSince(ms: number | null): string {
  if (ms === null) return 'you were last here';
  const d = new Date(ms);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

function buildRows(messages: ChatMessage[], hasMoreBefore: boolean, firstUnreadId: string | null, pending: PendingInteraction[]): Row[] {
  const grouped = groupMessages(
    messages.map((m) => ({ id: m.id, authorId: m.author.id, timestamp: Date.parse(m.timestamp), breaksGroup: m.type !== 0 || Boolean(m.message_reference) || Boolean(m.interaction_metadata), message: m })),
  );
  const rows: Row[] = [];
  if (!hasMoreBefore) rows.push({ kind: 'start', key: 'start' });
  for (const g of grouped) {
    if (g.startsDay) rows.push({ kind: 'day', key: `day-${g.message.id}`, label: formatDay(g.message.timestamp) });
    if (firstUnreadId && g.message.id === firstUnreadId) rows.push({ kind: 'new', key: 'new' });
    rows.push({ kind: 'message', key: g.message.id, message: g.message.message, startsGroup: g.startsGroup || (firstUnreadId === g.message.id) });
  }
  for (const p of pending) rows.push({ kind: 'thinking', key: `thinking-${p.id}`, pending: p });
  return rows;
}

function ThinkingRow({ pending }: { pending: PendingInteraction }) {
  return (
    <div className="message starts-group is-thinking" role="status">
      <div className="message-row">
        <div className="message-gutter"><Avatar id={pending.applicationId} name={pending.appName} size={40} bot /></div>
        <div className="message-main">
          <header className="message-head"><span className="message-author">{pending.appName}</span></header>
          <p className="thinking-text"><span className="typing-dots" aria-hidden="true"><i /><i /><i /></span> {pending.appName} is thinking…</p>
        </div>
      </div>
    </div>
  );
}

export function MessageList({ channelId }: { channelId: string }) {
  const channel = useGuildStore((s) => s.channels[channelId]);
  const timeline = useMessageStore((s) => s.timelines[channelId]);
  const me = useSessionStore((s) => s.user?.id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pending = useInteractionStore((s) => s.pending[channelId]);
  const [atBottom, setAtBottom] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const anchor = useReadNavStore((s) => s.anchors[channelId] ?? null);
  const barDismissed = useReadNavStore((s) => s.barDismissed[channelId] ?? false);
  const jump = useReadNavStore((s) => (s.jump?.channelId === channelId ? s.jump : null));
  const lastRead = useReadStateStore((s) => s.byChannel[channelId]?.lastReadId ?? null);
  const jumping = useRef<number | null>(null);
  const pendingPrepend = useRef<number | null>(null);

  // Capture the read marker once per channel visit so the "New" divider stays put while reading.
  useEffect(() => {
    useReadNavStore.getState().captureAnchor(channelId, useReadStateStore.getState().byChannel[channelId]?.lastReadId ?? null);
    return () => useReadNavStore.getState().releaseAnchor(channelId);
  }, [channelId]);

  const load = useCallback(async () => {
    if (!channel) return;
    setError(null);
    try {
      await getRuntime().privacy.sender.loadHistory(channel);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load messages');
    }
  }, [channel]);

  useEffect(() => {
    if (!timeline?.loaded && !jump) void load();
  }, [timeline?.loaded, load, jump]);

  const messages = useMemo(() => (timeline ? timeline.ids.map((id) => timeline.byId[id]).filter((m): m is ChatMessage => Boolean(m)) : []), [timeline]);
  const markers = useMemo(() => messages.filter((m) => !m.localState).map((m) => ({ id: m.id, authorId: m.author.id })), [messages]);
  const firstUnread = useMemo(() => firstUnreadMessageId(markers, anchor, me), [markers, anchor, me]);
  const rows = useMemo(() => buildRows(messages, timeline?.hasMoreBefore ?? true, firstUnread, pending ?? []), [messages, timeline?.hasMoreBefore, firstUnread, pending]);
  const bar = useMemo(() => {
    if (!anchor || barDismissed || !isUnread(channel?.last_message_id, lastRead)) return null;
    return unreadBar(markers, anchor, me, timeline?.hasMoreBefore ?? false);
  }, [anchor, barDismissed, channel?.last_message_id, lastRead, markers, me, timeline?.hasMoreBefore]);

  useEffect(() => {
    if (!pending || pending.length === 0) return;
    const timer = window.setInterval(() => useInteractionStore.getState().expirePending(Date.now()), Math.min(PENDING_TTL_MS, 30_000));
    return () => window.clearInterval(timer);
  }, [pending]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 64,
    overscan: 10,
    getItemKey: (i) => rows[i]?.key ?? i,
  });

  const scrollToEnd = useCallback(() => {
    if (rows.length > 0) virtualizer.scrollToIndex(rows.length - 1, { align: 'end' });
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [rows.length, virtualizer]);

  useLayoutEffect(() => {
    if (pendingPrepend.current !== null) {
      const el = scrollRef.current;
      if (el) el.scrollTop += virtualizer.getTotalSize() - pendingPrepend.current;
      pendingPrepend.current = null;
    } else if (atBottom) {
      scrollToEnd();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, timeline?.loaded]);

  const loadOlder = useCallback(async () => {
    if (!channel || loadingOlder || !timeline?.hasMoreBefore || timeline.ids.length === 0) return;
    setLoadingOlder(true);
    pendingPrepend.current = virtualizer.getTotalSize();
    try {
      const oldest = timeline.ids.find((id) => !timeline.byId[id]?.localState);
      await getRuntime().privacy.sender.loadHistory(channel, oldest);
    } catch (e) {
      pendingPrepend.current = null;
      reportError(e, 'Could not load older messages');
    } finally {
      setLoadingOlder(false);
    }
  }, [channel, loadingOlder, timeline, virtualizer]);

  const loadingNewer = useRef(false);
  const loadNewer = useCallback(async () => {
    if (!channel || loadingNewer.current) return;
    loadingNewer.current = true;
    try {
      await getRuntime().privacy.sender.loadNewer(channel);
    } catch (e) {
      reportError(e, 'Could not load newer messages');
    } finally {
      loadingNewer.current = false;
    }
  }, [channel]);

  /** "Jump to present": reload the latest page when the window is detached, then pin to the bottom. */
  const jumpToPresent = useCallback(async () => {
    if (timeline?.hasMoreAfter && channel) {
      try {
        await getRuntime().privacy.sender.loadHistory(channel);
      } catch (e) {
        reportError(e, 'Could not load messages');
        return;
      }
    }
    setAtBottom(true);
    requestAnimationFrame(scrollToEnd);
  }, [channel, timeline?.hasMoreAfter, scrollToEnd]);

  // Jump to a message (reply, pin, link, search hit, first unread): load the window around it when it is not in memory, then scroll and flash.
  useEffect(() => {
    if (!jump || !channel || jumping.current === jump.id) return;
    const ids = timeline?.ids ?? [];
    const target = jump.mode === 'message' ? (ids.includes(jump.messageId) ? jump.messageId : null) : firstUnreadMessageId(markers, jump.messageId, me);
    if (!target) {
      jumping.current = jump.id;
      const wanted = jump;
      void (async () => {
        try {
          await getRuntime().privacy.sender.loadAround(channel, wanted.messageId);
        } catch (e) {
          reportError(e, 'Could not load that message');
        }
        const t = useMessageStore.getState().timelines[channelId];
        const found =
          wanted.mode === 'message'
            ? Boolean(t?.ids.includes(wanted.messageId))
            : Boolean(t && firstUnreadMessageId(t.ids.map((id) => ({ id, authorId: t.byId[id]?.author.id ?? '' })), wanted.messageId, me));
        if (!found) {
          useReadNavStore.getState().consumeJump(wanted.id);
          useUiStore.getState().toast({ tone: 'info', title: 'That message is no longer available' });
          if (!t?.loaded) void load();
        } else {
          jumping.current = null; // the timeline changed: the effect re-runs with the target in memory
        }
      })();
      return;
    }
    const index = rows.findIndex((r) => r.kind === 'message' && r.message.id === target);
    if (index < 0) return;
    useReadNavStore.getState().consumeJump(jump.id);
    jumping.current = null;
    setAtBottom(false);
    virtualizer.scrollToIndex(index, { align: 'center' });
    setFlashId(target);
    const timer = window.setTimeout(() => setFlashId((v) => (v === target ? null : v)), 2200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump, channel, timeline?.ids, rows]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
    const bottom = near && !timeline?.hasMoreAfter;
    setAtBottom(bottom);
    if (el.scrollTop < 200) void loadOlder();
    if (near && timeline?.hasMoreAfter) void loadNewer();
    if (bottom && document.hasFocus()) markChannelRead(channelId);
  };

  useEffect(() => {
    if (atBottom && document.hasFocus()) markChannelRead(channelId);
  }, [atBottom, channelId, rows.length]);
  useEffect(() => {
    const onFocus = () => atBottom && markChannelRead(channelId);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [atBottom, channelId]);

  const retry = useCallback(
    (m: ChatMessage) => {
      if (!channel) return;
      useMessageStore.getState().remove(channelId, m.id);
      void getRuntime().privacy.sender.send(channel, { content: m.content, replyTo: m.message_reference?.message_id ?? null }).catch((e) => reportError(e, 'Could not send message'));
    },
    [channel, channelId],
  );
  const discard = useCallback((m: ChatMessage) => useMessageStore.getState().remove(channelId, m.id), [channelId]);

  useRovingFocus(scrollRef, { selector: '.message', enabled: Boolean(timeline?.loaded) });

  if (!timeline?.loaded) {
    if (error) {
      return (
        <div className="message-list is-state">
          <EmptyState icon={<WarningCircle size={36} weight="light" />} title="Could not load messages" body={error} action={<Button variant="primary" onClick={() => void load()}>Try again</Button>} />
        </div>
      );
    }
    return (
      <div className="message-list is-state" aria-busy="true">
        {[0.7, 0.45, 0.85, 0.55, 0.65].map((w, i) => (
          <div key={i} className="message-skeleton">
            <Skeleton width={40} height={40} radius={20} />
            <div>
              <Skeleton width={120} height={12} />
              <Skeleton width={`${w * 100}%`} height={14} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="message-list-wrap">
      <div ref={scrollRef} className="message-list" onScroll={onScroll} role="log" aria-live="polite" aria-label="Messages">
        {loadingOlder && (
          <div className="older-loader">
            <Spinner size={16} /> Loading earlier messages
          </div>
        )}
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            if (!row) return null;
            return (
              <div key={item.key} data-index={item.index} ref={virtualizer.measureElement} className="row-slot" style={{ transform: `translateY(${item.start}px)` }}>
                {row.kind === 'start' && (
                  <div className="channel-start">
                    <ChatCircleDots size={44} weight="light" />
                    <h2>{channel?.guild_id ? `Welcome to #${channel.name}` : 'This is the beginning of your conversation'}</h2>
                    <p>{channel?.topic ?? 'Say hello and start the conversation.'}</p>
                  </div>
                )}
                {row.kind === 'day' && (
                  <div className="day-divider" role="separator">
                    <span>{row.label}</span>
                  </div>
                )}
                {row.kind === 'new' && (
                  <div className="new-divider" role="separator">
                    <span>New</span>
                  </div>
                )}
                {row.kind === 'thinking' && <ThinkingRow pending={row.pending} />}
                {row.kind === 'message' && <MessageItem message={row.message} flash={flashId === row.message.id} startsGroup={row.startsGroup} guildId={channel?.guild_id} onRetry={retry} onDiscard={discard} />}
              </div>
            );
          })}
        </div>
        {timeline.ids.length === 0 && !timeline.hasMoreBefore && null}
      </div>
      {bar && (
        <div className="unread-bar" role="status">
          <span className="unread-bar-text">
            {bar.count}
            {bar.more ? '+' : ''} new {bar.count === 1 && !bar.more ? 'message' : 'messages'} since {formatSince(bar.sinceMs)}
          </span>
          <button type="button" className="unread-bar-action" onClick={() => jumpToFirstUnread(channelId)}>
            <ArrowUp size={12} weight="bold" /> Jump to first unread
          </button>
          <button
            type="button"
            className="unread-bar-action"
            onClick={() => {
              markChannelRead(channelId);
              useReadNavStore.getState().dismissBar(channelId);
            }}
          >
            Mark as read
          </button>
        </div>
      )}
      {!atBottom && (
        <button type="button" className="jump-bottom glass" onClick={() => void jumpToPresent()}>
          <ArrowDown size={14} weight="bold" /> Jump to present
        </button>
      )}
    </div>
  );
}
