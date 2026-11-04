import { useMemo } from 'react';
import { getRuntime } from '../runtime';
import { MessageService } from './messageService';

/** The message use cases wired to the app's API client. */
export function useMessageService(): MessageService {
  return useMemo(() => new MessageService(getRuntime().api), []);
}
