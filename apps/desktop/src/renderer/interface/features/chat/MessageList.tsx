import { ArrowDown, ChatCircleDots, WarningCircle } from '@phosphor-icons/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { PENDING_TTL_MS, useInteractionStore, type PendingInteraction } from '@renderer/application/stores/interactionStore';
import { useMessageStore, type ChatMessage } from '@renderer/application/stores/messageStore';
import { useReadStateStore } from '@renderer/application/stores/peopleStores';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { groupMessages } from '@renderer/domain/messageGrouping';
import { compareSnowflakes } from '@renderer/domain/snowflake';
import { markChannelRead, reportError } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { formatDay } from '../../shared/hooks/useNow';
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

function buildRows(messages: ChatMessage[], hasMoreBefore: boolean, firstUnreadId: string | null, me: string | undefined, pending: PendingInteraction[]): Row[] {
  const grouped = groupMessages(
    messages.map((m) => ({ id: m.id, authorId: m.author.id, timestamp: Date.parse(m.timestamp), breaksGroup: m.type !== 0 || Boolean(m.message_reference) || Boolean(m.interaction_metadata), message: m })),
  );
  const rows: Row[] = [];
  if (!hasMoreBefore) rows.push({ kind: 'start', key: 'start' });
  for (const g of grouped) {
    if (g.startsDay) rows.push({ kind: 'day', key: `day-${g.message.id}`, label: formatDay(g.message.timestamp) });
    if (firstUnreadId && g.message.id === firstUnreadId && g.message.message.author.id !== me) rows.push({ kind: 'new', key: 'new' });
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
  const [firstUnread, setFirstUnread] = useState<string | null>(null);
  const pendingPrepend = useRef<number | null>(null);

  // Capture the read marker once per channel visit so the "New" divider stays put while reading.
  useEffect(() => {
    const lastRead = useReadStateStore.getState().byChannel[channelId]?.lastReadId ?? null;
    const ids = useMessageStore.getState().timelines[channelId]?.ids ?? [];
    setFirstUnread(lastRead ? (ids.find((id) => compareSnowflakes(id, lastRead) > 0) ?? null) : null);
  }, [channelId, timeline?.loaded]);

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
    if (!timeline?.loaded) void load();
  }, [timeline?.loaded, load]);

  const messages = useMemo(() => (timeline ? timeline.ids.map((id) => timeline.byId[id]).filter((m): m is ChatMessage => Boolean(m)) : []), [timeline]);
  const rows = useMemo(() => buildRows(messages, timeline?.hasMoreBefore ?? true, firstUnread, me, pending ?? []), [messages, timeline?.hasMoreBefore, firstUnread, me, pending]);

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

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
    setAtBottom(bottom);
    if (el.scrollTop < 200) void loadOlder();
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
                {row.kind === 'message' && <MessageItem message={row.message} startsGroup={row.startsGroup} guildId={channel?.guild_id} onRetry={retry} onDiscard={discard} />}
              </div>
            );
          })}
        </div>
        {timeline.ids.length === 0 && !timeline.hasMoreBefore && null}
      </div>
      {!atBottom && (
        <button type="button" className="jump-bottom glass" onClick={scrollToEnd}>
          <ArrowDown size={14} weight="bold" /> Jump to present
        </button>
      )}
    </div>
  );
}
