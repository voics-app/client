import { create } from 'zustand';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import type { DeliveryMode } from '@discordy/core/contracts/rest';
import { useConnectionStore } from '../../app/connectionStore';

export interface FailedDraft {
  text: string;
  files: File[];
  descriptions: ReadonlyMap<File, string>;
  mentions: ReadonlyMap<string, string>;
  replyTo: ChatMessage | null;
  pingReplied: boolean;
}

export interface FailedSendScope { generation: number; authorId: string | null; instance: string; channelId: string; mode: DeliveryMode }
export interface FailedSend { id: number; draft: FailedDraft }
interface State { byScope: Record<string, FailedSend[]>; add(scope: FailedSendScope, draft: FailedDraft): void; remove(scope: FailedSendScope, id: number): void; clear(): void }

let generation = 0;
let nextId = 0;
export const failedSendKey = (scope: FailedSendScope) => JSON.stringify([scope.generation, scope.authorId, scope.instance, scope.channelId, scope.mode]);
export const captureFailedSendScope = (channelId: string, mode: DeliveryMode): FailedSendScope => ({ generation, authorId: useSessionStore.getState().user?.id ?? null, instance: useConnectionStore.getState().apiUrl, channelId, mode });
export const currentFailedSendScope = (scope: FailedSendScope): boolean => scope.authorId !== null && scope.generation === generation && scope.authorId === useSessionStore.getState().user?.id && scope.instance === useConnectionStore.getState().apiUrl;

/** Failed drafts stay in memory, separate from the live composer, until restored or the session ends. */
export const useFailedSendQueue = create<State>((set) => ({
  byScope: {},
  add: (scope, draft) => {
    if (scope.mode !== 'standard' || !currentFailedSendScope(scope)) return;
    const key = failedSendKey(scope);
    set((state) => ({ byScope: { ...state.byScope, [key]: [...(state.byScope[key] ?? []), { id: ++nextId, draft }] } }));
  },
  remove: (scope, id) => set((state) => {
    const key = failedSendKey(scope);
    return { byScope: { ...state.byScope, [key]: (state.byScope[key] ?? []).filter((item) => item.id !== id) } };
  }),
  clear: () => set({ byScope: {} }),
}));

function clearForSession(): void { generation++; useFailedSendQueue.getState().clear(); }
useSessionStore.subscribe((next, previous) => {
  if (next.user?.id !== previous.user?.id || next.sessionId !== previous.sessionId || next.deviceId !== previous.deviceId
    || (next.status !== previous.status && (next.status === 'signedOut' || next.status === 'booting'))) clearForSession();
});
useConnectionStore.subscribe((next, previous) => { if (next.apiUrl !== previous.apiUrl) clearForSession(); });
