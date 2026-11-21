// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { User } from '@discordy/core/contracts/rest';
import { useConnectionStore } from '@renderer/interface/app/connectionStore';
import { captureFailedSendScope, failedSendKey, useFailedSendQueue, type FailedDraft } from '@renderer/interface/features/chat/failedSendQueue';

const user = (id: string) => ({ id, username: id, global_name: null, avatar: null }) as User;
beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setUser(user('alice'));
  useConnectionStore.getState().set({ apiUrl: 'https://one.test', gatewayUrl: '', cdnUrl: '' });
  useFailedSendQueue.getState().clear();
});

describe('failed-send queue', () => {
  it('retains complete drafts separately and clears them on endpoint or account change', () => {
    const scope = captureFailedSendScope('channel', 'standard');
    const file = new File(['x'], 'note.txt', { type: 'text/plain' });
    const draft: FailedDraft = { text: 'first', files: [file], descriptions: new Map([[file, 'caption']]), mentions: new Map([['@Ada', '<@1>']]), replyTo: null, pingReplied: false };
    useFailedSendQueue.getState().add(captureFailedSendScope('channel', 'ephemeral'), draft);
    expect(useFailedSendQueue.getState().byScope).toEqual({});
    useFailedSendQueue.getState().add(scope, draft);
    useFailedSendQueue.getState().add(scope, { ...draft, text: 'second' });
    expect(useFailedSendQueue.getState().byScope[failedSendKey(scope)]?.map((item) => item.draft.text)).toEqual(['first', 'second']);
    expect(useFailedSendQueue.getState().byScope[failedSendKey(scope)]?.[0]?.draft.files[0]).toBe(file);
    useConnectionStore.getState().set({ apiUrl: 'https://two.test', gatewayUrl: '', cdnUrl: '' });
    expect(useFailedSendQueue.getState().byScope).toEqual({});
    useFailedSendQueue.getState().add(scope, draft);
    expect(useFailedSendQueue.getState().byScope).toEqual({});
    const current = captureFailedSendScope('channel', 'standard');
    useFailedSendQueue.getState().add(current, draft);
    useSessionStore.getState().setUser(user('bob'));
    expect(useFailedSendQueue.getState().byScope).toEqual({});
  });
});
