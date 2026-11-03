import { describe, expect, it } from 'vitest';
import { authErrorDisplay, SIGN_IN_FAILED } from '../../../src/renderer/domain/authErrors';

const err = (message: string) => ({ _errors: [{ code: 'X', message }] });

describe('authErrorDisplay', () => {
  it('a failed credential check shows only the fixed vague message, never the server text', () => {
    expect(authErrorDisplay({ login: err('Login or password is invalid.') }, ['email', 'password'])).toEqual({
      fields: {},
      general: SIGN_IN_FAILED,
    });
    expect(SIGN_IN_FAILED).not.toMatch(/password|email|account|exist/i);
  });

  it('shows other errors whose key is not a visible field in the banner', () => {
    expect(authErrorDisplay({ body: err('Something else') }, ['email'])).toEqual({ fields: {}, general: 'Something else' });
  });

  it('puts errors for visible fields under the field', () => {
    expect(authErrorDisplay({ email: err('Email is already registered.'), password: err('Too short') }, ['email', 'password', 'username'])).toEqual({
      fields: { email: 'Email is already registered.', password: 'Too short' },
      general: null,
    });
  });

  it('tolerates missing or malformed entries', () => {
    expect(authErrorDisplay(undefined, ['email'])).toEqual({ fields: {}, general: null });
    expect(authErrorDisplay({ email: null, body: { _errors: [] } }, ['email'])).toEqual({ fields: {}, general: null });
  });
});
