import { describe, expect, it } from 'vitest';
import { initialsOf } from '@renderer/interface/shared/ui/Avatar';
import { displayName } from '@renderer/interface/shared/hooks/useNames';
import type { User } from '@shared/contracts';

describe('names for partial users', () => {
  // Gateway VOICE_STATE_UPDATE and PRESENCE_UPDATE carry partial users ({ id } only).
  const partial = { id: '42' } as unknown as Pick<User, 'username' | 'global_name'>;

  it('displayName never returns undefined', () => {
    expect(displayName(partial)).toBe('Unknown user');
    expect(displayName(partial, 'Nick')).toBe('Nick');
    expect(displayName({ username: 'alice', global_name: null })).toBe('alice');
  });

  it('initialsOf tolerates a missing name', () => {
    expect(initialsOf(undefined as unknown as string)).toBe('?');
    expect(initialsOf('Ada Lovelace')).toBe('AL');
  });
});
