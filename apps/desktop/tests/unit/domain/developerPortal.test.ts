import { describe, expect, it } from 'vitest';
import { commandBody, tokenReducer, validateApplicationForm, validateCommandForm, visibleToken, type TokenReveal } from '@renderer/domain/developerPortal';

const slash = (name: string, description = 'does a thing') => ({ type: 1 as const, name, description });
const user = (name: string) => ({ type: 2 as const, name, description: '' });
const message = (name: string) => ({ type: 3 as const, name, description: '' });
const rep = (n: number) => 'x'.repeat(n);

describe('slash command names', () => {
  it('accepts lowercase letters, digits, - and _', () => {
    for (const n of ['roll', 'a', 'roll-2_x', rep(32), 'été']) expect(validateCommandForm(slash(n)).name, n).toBeUndefined();
  });
  it('rejects empty, uppercase, spaces, symbols and over 32 characters', () => {
    for (const n of ['', 'Roll', 'my command', 'a!', rep(33)]) expect(validateCommandForm(slash(n)).name, n).toBeTruthy();
  });
  it('requires a description of 1 to 100 characters', () => {
    expect(validateCommandForm(slash('ok', '')).description).toBeTruthy();
    expect(validateCommandForm(slash('ok', rep(101))).description).toBeTruthy();
    expect(validateCommandForm(slash('ok', rep(100))).description).toBeUndefined();
  });
});

describe('context-menu command names', () => {
  it('allow spaces, capitals and up to 32 characters, and need no description', () => {
    for (const f of [user, message]) {
      expect(validateCommandForm(f('Show Stats'))).toEqual({});
      expect(validateCommandForm(f(rep(32)))).toEqual({});
      expect(validateCommandForm(f(rep(33))).name).toBeTruthy();
      expect(validateCommandForm(f('   ')).name).toBeTruthy();
    }
  });
  it('send a trimmed name with an empty description', () => {
    expect(commandBody({ type: 3, name: ' Translate ', description: 'ignored' })).toEqual({ type: 3, name: 'Translate', description: '' });
    expect(commandBody(slash('roll', ' d '))).toEqual({ type: 1, name: 'roll', description: 'd' });
  });
});

describe('application form', () => {
  it('needs a name of 2 to 32 characters and a description up to 400', () => {
    expect(validateApplicationForm('a', '').name).toBeTruthy();
    expect(validateApplicationForm('ab', '')).toEqual({});
    expect(validateApplicationForm(rep(33), '').name).toBeTruthy();
    expect(validateApplicationForm('ab', rep(401)).description).toBeTruthy();
  });
});

describe('bot token reveal', () => {
  const revealed: TokenReveal = tokenReducer(null, { kind: 'reveal', applicationId: 'app1', token: 'secret' });
  it('shows the token only for the application it was issued for', () => {
    expect(visibleToken(revealed, 'app1')).toBe('secret');
    expect(visibleToken(revealed, 'app2')).toBeNull();
    expect(visibleToken(null, 'app1')).toBeNull();
  });
  it('is gone after dismissing', () => {
    expect(visibleToken(tokenReducer(revealed, { kind: 'dismiss' }), 'app1')).toBeNull();
  });
  it('is dropped when another application is selected but kept for the same one', () => {
    expect(tokenReducer(revealed, { kind: 'select', applicationId: 'app1' })).toBe(revealed);
    expect(tokenReducer(revealed, { kind: 'select', applicationId: 'app2' })).toBeNull();
    expect(tokenReducer(revealed, { kind: 'select', applicationId: null })).toBeNull();
  });
  it('a new reset replaces the previous token', () => {
    expect(visibleToken(tokenReducer(revealed, { kind: 'reveal', applicationId: 'app1', token: 'next' }), 'app1')).toBe('next');
  });
});
