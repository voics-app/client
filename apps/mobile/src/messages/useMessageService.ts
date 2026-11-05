import { useMemo } from 'react';
import { getRuntime } from '../runtime';
import { messageCache } from '../offline/messageCache';
import { MessageService } from './messageService';

/** The message use cases wired to the app's API client. */
export function useMessageService(): MessageService {
  return useMemo(() => new MessageService(getRuntime().api, Date.now, undefined, messageCache, getRuntime().privacy?.sender ?? null), []);
}
