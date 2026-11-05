import { useEffect, useRef, useState, type RefObject } from 'react';
import type { FlatList } from 'react-native';
import { errorMessage } from '@discordy/core/application/errorMessage';
import { useMessageStore } from '@discordy/core/application/stores/messageStore';
import { useReadNavStore } from '@discordy/core/application/stores/readNavStore';
import type { Channel } from '@discordy/core/contracts/rest';
import type { ChatRow } from './chatRows';
import type { MessageService } from './messageService';

export const FLASH_MS = 2200;

export interface JumpOptions {
  channel: Channel | undefined;
  rows: readonly ChatRow[];
  service: MessageService;
  listRef: RefObject<FlatList<ChatRow> | null>;
  /** The jump could not be done (the message is gone, or the request failed). */
  onFailed(reason: string): void;
}

/**
 * Serves jump requests for this channel from `useReadNavStore` (a reply, pin, search hit, link or inbox entry): scrolls to the message when it
 * is in the timeline, else loads the window around it first. Returns the id to highlight for a moment and whether a request is waiting.
 */
export function useJumpToMessage({ channel, rows, service, listRef, onFailed }: JumpOptions): { flashId: string | null; pending: boolean } {
  const channelId = channel?.id;
  const jump = useReadNavStore((s) => (s.jump && s.jump.channelId === channelId && s.jump.mode === 'message' ? s.jump : null));
  const [flashId, setFlashId] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const loading = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  useEffect(() => {
    if (!jump || !channel || loading.current === jump.id) return;
    const index = rows.findIndex((row) => row.kind === 'message' && row.message.id === jump.messageId);
    if (index < 0) {
      loading.current = jump.id;
      void service
        .loadAround(channel, jump.messageId)
        .then(() => {
          loading.current = null;
          if (useMessageStore.getState().timelines[channel.id]?.ids.includes(jump.messageId)) {
            setRetry((n) => n + 1);
            return;
          }
          useReadNavStore.getState().consumeJump(jump.id);
          onFailed('That message is no longer available.');
        })
        .catch((error: unknown) => {
          loading.current = null;
          useReadNavStore.getState().consumeJump(jump.id);
          onFailed(errorMessage(error));
        });
      return;
    }
    useReadNavStore.getState().consumeJump(jump.id);
    listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    setFlashId(jump.messageId);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlashId(null), FLASH_MS);
    // `retry` re-runs the effect once the window around the target is in the timeline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump, channel, rows, retry]);

  return { flashId, pending: jump !== null };
}
