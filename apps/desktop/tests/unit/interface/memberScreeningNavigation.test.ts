import { afterEach, describe, expect, it } from 'vitest';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { openGuild } from '@renderer/interface/app/navigation';

afterEach(() => {
  useGuildStore.getState().reset();
  useSessionStore.getState().reset();
  useUiStore.getState().openDialog(null);
});

describe('pending membership navigation', () => {
  it('reopens rules when a pending member selects the server', () => {
    useSessionStore.getState().setUser({ id: '7', username: 'guest' } as never);
    useGuildStore.setState({ members: { '1': { '7': { user: { id: '7' }, pending: true } as never } } });
    openGuild('1');
    expect(useUiStore.getState().dialog).toEqual({ kind: 'memberScreening', guildId: '1' });
  });
});
