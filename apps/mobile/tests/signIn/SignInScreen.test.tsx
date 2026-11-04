import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SIGN_IN_FAILED } from '@discordy/core/domain/authErrors';
import { ApiError } from '@discordy/core/infrastructure/http/httpClient';
import { SignInScreen } from '../../src/signIn/SignInScreen';
import { MFA_REQUIRED } from '../../src/signIn/signInOutcome';

async function setup(login = jest.fn(), loginMfa = jest.fn()) {
  await render(<SignInScreen session={{ login, loginMfa }} />);
  return { login, loginMfa };
}

async function fillCredentials() {
  await fireEvent.changeText(screen.getByLabelText('Email'), ' me@example.test ');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'pw');
}

describe('SignInScreen', () => {
  it('keeps Sign in disabled until email and password are filled', async () => {
    const { login } = await setup();
    await fireEvent.press(screen.getByText('Sign in'));
    expect(login).not.toHaveBeenCalled();
    await fillCredentials();
    await fireEvent.press(screen.getByText('Sign in'));
    expect(login).toHaveBeenCalledWith({ email: 'me@example.test', password: 'pw' });
  });

  it('shows the vague message when the credentials are wrong', async () => {
    const login = jest.fn().mockRejectedValue(new ApiError(400, 50035, 'x', { login: { _errors: [{ code: 'c', message: 'No such account' }] } }));
    await setup(login);
    await fillCredentials();
    await fireEvent.press(screen.getByText('Sign in'));
    expect(await screen.findByText(SIGN_IN_FAILED)).toBeTruthy();
    expect(screen.queryByText('No such account')).toBeNull();
  });

  it('moves to the 2FA step and completes sign-in with the ticket', async () => {
    const login = jest.fn().mockRejectedValue(new ApiError(401, MFA_REQUIRED, 'mfa', undefined, 'tkt'));
    const loginMfa = jest.fn().mockResolvedValue(undefined);
    await setup(login, loginMfa);
    await fillCredentials();
    await fireEvent.press(screen.getByText('Sign in'));
    expect(await screen.findByText('Two-factor authentication')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Authenticator or backup code'), ' 123456 ');
    await fireEvent.press(screen.getByText('Verify'));
    await waitFor(() => expect(loginMfa).toHaveBeenCalledWith({ ticket: 'tkt', code: '123456' }));
  });

  it('shows a wrong 2FA code and lets the user go back to the credentials', async () => {
    const login = jest.fn().mockRejectedValue(new ApiError(401, MFA_REQUIRED, 'mfa', undefined, 'tkt'));
    const loginMfa = jest.fn().mockRejectedValue(new ApiError(400, 50035, 'Invalid code'));
    await setup(login, loginMfa);
    await fillCredentials();
    await fireEvent.press(screen.getByText('Sign in'));
    await fireEvent.changeText(await screen.findByLabelText('Authenticator or backup code'), '000000');
    await fireEvent.press(screen.getByText('Verify'));
    expect(await screen.findByText('Invalid code')).toBeTruthy();
    await fireEvent.press(screen.getByText('Back'));
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.queryByText('Invalid code')).toBeNull();
  });
});
