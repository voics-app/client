import { canLeaveAccount, credentialChange, credentialField, fieldMessage } from '../../src/settings/account/accountModel';

describe('credentialChange', () => {
  it('sends a trimmed username or email with the current password', () => {
    expect(credentialChange('username', ' newname ', '', 'pw')).toEqual({ change: { username: 'newname', password: 'pw' } });
    expect(credentialChange('email', ' a@b.test ', '', 'pw')).toEqual({ change: { email: 'a@b.test', password: 'pw' } });
  });

  it('applies the new password rules before anything is sent', () => {
    expect(credentialChange('password', 'short', 'short', 'pw')).toEqual({ problem: 'Use at least 8 characters.' });
    expect(credentialChange('password', 'long enough 1', 'different 22', 'pw')).toEqual({ problem: 'The passwords do not match.' });
    expect(credentialChange('password', 'long enough 1', 'long enough 1', 'pw')).toEqual({ change: { new_password: 'long enough 1', password: 'pw' } });
  });

  it('reports a failed password change under new_password', () => {
    expect(credentialField('password')).toBe('new_password');
    expect(credentialField('email')).toBe('email');
  });
});

describe('fieldMessage', () => {
  it('prefers the field message of the API envelope, then the summary', () => {
    const error = Object.assign(new Error('Invalid form body'), { errors: { password: { _errors: [{ message: 'Wrong password' }] } } });
    expect(fieldMessage(error, 'password')).toBe('Wrong password');
    expect(fieldMessage(error, 'email')).toContain('Invalid form body');
  });
});

describe('canLeaveAccount', () => {
  it('always needs the password; deleting also needs the username typed back', () => {
    expect(canLeaveAccount('disable', '', 'me', 'pw')).toBe(true);
    expect(canLeaveAccount('disable', '', 'me', '')).toBe(false);
    expect(canLeaveAccount('delete', 'nope', 'me', 'pw')).toBe(false);
    expect(canLeaveAccount('delete', ' ME ', 'me', 'pw')).toBe(true);
    expect(canLeaveAccount('delete', 'me', 'me', '')).toBe(false);
  });
});
