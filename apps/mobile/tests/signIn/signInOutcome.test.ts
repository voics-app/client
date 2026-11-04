import { SIGN_IN_FAILED } from '@discordy/core/domain/authErrors';
import { ApiError } from '@discordy/core/infrastructure/http/httpClient';
import { interpretSignInError, MFA_REQUIRED } from '../../src/signIn/signInOutcome';

const envelope = (key: string, message: string) => ({ [key]: { _errors: [{ code: 'x', message }] } });

describe('interpretSignInError', () => {
  it('asks for the second factor when the answer is 60008 with a ticket', () => {
    expect(interpretSignInError(new ApiError(401, MFA_REQUIRED, 'mfa', undefined, 'ticket-1'))).toEqual({ kind: 'mfa', ticket: 'ticket-1' });
  });

  it('shows the vague message for a credential failure, whatever the server said', () => {
    const outcome = interpretSignInError(new ApiError(400, 50035, 'bad', envelope('login', 'No such account')));
    expect(outcome).toEqual({ kind: 'error', message: SIGN_IN_FAILED, fields: {} });
  });

  it('maps visible field errors and falls back to the API message', () => {
    const outcome = interpretSignInError(new ApiError(400, 50035, 'Invalid form body', envelope('email', 'Not an email')));
    expect(outcome).toEqual({ kind: 'error', message: 'Invalid form body', fields: { email: 'Not an email' } });
  });

  it('says offline for a network failure and uses the message of other errors', () => {
    expect(interpretSignInError(new ApiError(0, 0, 'fetch failed'))).toMatchObject({ message: 'You appear to be offline.' });
    expect(interpretSignInError(new Error('boom'))).toMatchObject({ message: 'boom' });
  });

  it('does not enter the 2FA step without a ticket', () => {
    expect(interpretSignInError(new ApiError(401, MFA_REQUIRED, 'mfa')).kind).toBe('error');
  });
});
