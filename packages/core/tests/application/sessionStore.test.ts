import { beforeEach, describe, expect, it } from 'vitest';
import { currentUserId, DEFAULT_SETTINGS, useSessionStore } from '../../src/application/stores/sessionStore';
import type { User } from '../../src/contracts/rest';

describe('sessionStore', () => {
  beforeEach(() => useSessionStore.getState().reset());

  it('merges settings patches over the defaults', () => {
    useSessionStore.getState().setSettings({ status: 'dnd' });
    expect(useSessionStore.getState().settings).toEqual({ ...DEFAULT_SETTINGS, status: 'dnd' });
  });

  it('exposes the signed-in user id and clears it on reset', () => {
    useSessionStore.getState().setUser({ id: 'u1' } as User);
    expect(currentUserId()).toBe('u1');
    useSessionStore.getState().reset();
    expect(currentUserId()).toBeNull();
    expect(useSessionStore.getState().status).toBe('signedOut');
  });
});
