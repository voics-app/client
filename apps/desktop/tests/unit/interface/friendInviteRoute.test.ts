import { expect, it, vi } from 'vitest';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { flushPendingRoute, handleRoute } from '@renderer/interface/app/navigation';

const calls = vi.hoisted(() => ({ useFriendInvite: vi.fn(async () => undefined) }));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: calls }) }));

it('holds a personal friend link until sign-in then sends the request', async () => {
  const token = 'k3J9x_Qw-1Zp0aB7cD4eF6gH8iJ2lMnO';
  useSessionStore.setState({ status: 'signedOut' } as never);
  handleRoute(`/friend-invite/${token}`);
  expect(calls.useFriendInvite).not.toHaveBeenCalled();
  useSessionStore.setState({ status: 'ready' } as never);
  flushPendingRoute();
  expect(calls.useFriendInvite).toHaveBeenCalledOnce();
  expect(calls.useFriendInvite).toHaveBeenCalledWith(token);
});
