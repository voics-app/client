// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';

const fixture = vi.hoisted(() => ({ perform: vi.fn(), cancel: vi.fn() }));
vi.mock('@renderer/interface/app/bridge', () => ({ bridge: { passkeys: fixture } }));

import { performPasskey } from '@renderer/interface/app/passkeys';

describe('passkey errors', () => {
  it('uses the current account language when the request finishes', async () => {
    fixture.perform.mockResolvedValue({ ok: false, reason: 'timeout' });
    useSessionStore.getState().setSettings({ locale: 'en-US' });
    await expect(performPasskey('get', {}, new AbortController().signal)).rejects.toThrow('The passkey request expired. Start again.');
    useSessionStore.getState().setSettings({ locale: 'nl' });
    await expect(performPasskey('get', {}, new AbortController().signal)).rejects.toThrow('Het passkeyverzoek is verlopen. Begin opnieuw.');
    useSessionStore.getState().reset();
  });
});
