import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthLinkStore } from '@discordy/core/application/stores/authLinkStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { flushAuthLink, handleAuthRoute } from '@renderer/interface/app/authLinks';

const verifyEmail = vi.fn();
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: { verifyEmail } }) }));

const TOKEN = 'k3J9x_Qw-1Zp0aB7cD4eF6gH8iJ2lMnO';

describe('account email links', () => {
  beforeEach(() => {
    verifyEmail.mockReset();
    verifyEmail.mockResolvedValue(undefined);
    useAuthLinkStore.setState({ link: null });
    useUiStore.setState({ toasts: [] } as never);
  });

  it('ignores routes that are not account links', () => {
    expect(handleAuthRoute('/invite/abc')).toBe(false);
    expect(handleAuthRoute('/reset-password/short')).toBe(false);
  });

  it('keeps a link for the sign-in screen while signed out, without calling the api', () => {
    useSessionStore.setState({ status: 'signedOut' } as never);
    expect(handleAuthRoute(`/reset-password/${TOKEN}`)).toBe(true);
    expect(useAuthLinkStore.getState().link).toEqual({ kind: 'reset-password', token: TOKEN });
    expect(verifyEmail).not.toHaveBeenCalled();
  });

  it('verifies the email at once when signed in and tells the person', async () => {
    useSessionStore.setState({ status: 'ready' } as never);
    expect(handleAuthRoute(`/verify-email/${TOKEN}`)).toBe(true);
    await vi.waitFor(() => expect(verifyEmail).toHaveBeenCalledWith(TOKEN));
    await vi.waitFor(() => expect(useUiStore.getState().toasts.some((t) => t.title === 'Email verified')).toBe(true));
    expect(useAuthLinkStore.getState().link).toBeNull();
  });

  it('asks a signed-in person to sign out before a reset', () => {
    useSessionStore.setState({ status: 'ready' } as never);
    handleAuthRoute(`/reset-password/${TOKEN}`);
    expect(useUiStore.getState().toasts.some((t) => /Sign out/.test(t.title))).toBe(true);
  });

  it('applies a link that was waiting when the session turns out to be signed in', async () => {
    useAuthLinkStore.getState().set({ kind: 'verify-email', token: TOKEN });
    flushAuthLink();
    await vi.waitFor(() => expect(verifyEmail).toHaveBeenCalledWith(TOKEN));
  });
});
