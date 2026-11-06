import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { ApiError } from '@discordy/core/infrastructure/http/httpClient';
import { SignInScreen } from '../../src/signIn/SignInScreen';
import { VerifyEmailScreen } from '../../src/signIn/VerifyEmailScreen';

const TOKEN = 'k3J9x_Qw-1Zp0aB7cD4eF6gH8iJ2lMnO';

const mockSession = { boot: jest.fn(), login: jest.fn(), loginMfa: jest.fn(), register: jest.fn(), logout: jest.fn() };
const mockApi = { forgotPassword: jest.fn(), resetPassword: jest.fn(), verifyEmail: jest.fn(), messages: jest.fn(async () => []) };
jest.mock('../../src/runtime', () => ({ getRuntime: () => ({ session: mockSession, gateway: { state: 'idle', resumeNow: jest.fn() }, api: mockApi }) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.forgotPassword.mockResolvedValue(undefined);
  mockApi.resetPassword.mockResolvedValue(undefined);
  mockApi.verifyEmail.mockResolvedValue(undefined);
  useSessionStore.getState().reset();
  useSessionStore.getState().setStatus('booting');
  mockSession.boot.mockImplementation(async () => {
    if (useSessionStore.getState().status === 'booting') useSessionStore.getState().setStatus('signedOut');
  });
});

describe('create account', () => {
  const open = () => render(<SignInScreen session={mockSession} api={mockApi} />);

  it('registers with email, username and password, as desktop does', async () => {
    await open();
    await fireEvent.press(screen.getByText('New here? Create an account'));
    expect(screen.getByText('Create your account')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Email'), ' me@example.test ');
    await fireEvent.changeText(screen.getByLabelText('Username'), ' me ');
    await fireEvent.press(screen.getByText('Create account'));
    expect(mockSession.register).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Password'), 'longenough');
    await fireEvent.press(screen.getByText('Create account'));
    await waitFor(() => expect(mockSession.register).toHaveBeenCalledWith({ email: 'me@example.test', username: 'me', password: 'longenough' }));
  });

  it('shows the username error next to the field', async () => {
    mockSession.register.mockRejectedValue(new ApiError(400, 50035, 'bad', { username: { _errors: [{ code: 'taken', message: 'Username is taken' }] } }));
    await open();
    await fireEvent.press(screen.getByText('New here? Create an account'));
    await fireEvent.changeText(screen.getByLabelText('Email'), 'me@example.test');
    await fireEvent.changeText(screen.getByLabelText('Username'), 'me');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'longenough');
    await fireEvent.press(screen.getByText('Create account'));
    expect(await screen.findByText('Username is taken')).toBeTruthy();
  });

  it('goes back to sign in', async () => {
    await open();
    await fireEvent.press(screen.getByText('New here? Create an account'));
    await fireEvent.press(screen.getByText('Have an account? Sign in'));
    expect(screen.getByText('Welcome back')).toBeTruthy();
  });
});

describe('forgot and reset password', () => {
  it('asks for the reset email, then takes the code and the new password', async () => {
    await render(<SignInScreen session={mockSession} api={mockApi} />);
    await fireEvent.press(screen.getByText('Forgot password?'));
    await fireEvent.changeText(screen.getByLabelText('Email'), ' me@example.test ');
    await fireEvent.press(screen.getByText('Email me a reset code'));
    await waitFor(() => expect(mockApi.forgotPassword).toHaveBeenCalledWith('me@example.test'));
    expect(await screen.findByText(/reset code is on its way/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Reset code'), ` ${TOKEN} `);
    await fireEvent.changeText(screen.getByLabelText('New password'), 'new-password-1');
    await fireEvent.press(screen.getByText('Change password'));
    await waitFor(() => expect(mockApi.resetPassword).toHaveBeenCalledWith(TOKEN, 'new-password-1'));
    expect(await screen.findByText('Password changed. Sign in with the new one.')).toBeTruthy();
    expect(screen.getByText('Welcome back')).toBeTruthy();
  });

  it('opens on the new-password form with the token from the link already filled in', async () => {
    await render(<SignInScreen session={mockSession} api={mockApi} initialMode="reset" initialToken={TOKEN} />);
    expect(screen.getByText('Choose a new password')).toBeTruthy();
    expect(screen.getByDisplayValue(TOKEN)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('New password'), 'new-password-1');
    await fireEvent.press(screen.getByText('Change password'));
    await waitFor(() => expect(mockApi.resetPassword).toHaveBeenCalledWith(TOKEN, 'new-password-1'));
  });

  it('shows a refused reset code and stays on the form', async () => {
    mockApi.resetPassword.mockRejectedValue(new ApiError(400, 50035, 'bad', { token: { _errors: [{ code: 'expired', message: 'This code has expired' }] } }));
    await render(<SignInScreen session={mockSession} api={mockApi} initialMode="reset" initialToken={TOKEN} />);
    await fireEvent.changeText(screen.getByLabelText('New password'), 'new-password-1');
    await fireEvent.press(screen.getByText('Change password'));
    expect(await screen.findByText('This code has expired')).toBeTruthy();
    expect(screen.getByText('Choose a new password')).toBeTruthy();
  });
});

describe('email links', () => {
  it('voics://reset-password?token=... opens the reset form with the token, while signed out', async () => {
    await renderRouter('./app', { initialUrl: `/reset-password?token=${TOKEN}` });
    expect(await screen.findByText('Choose a new password')).toBeTruthy();
    expect(screen.getByDisplayValue(TOKEN)).toBeTruthy();
  });

  it('opens the reset form empty for a malformed token instead of filling it in', async () => {
    await renderRouter('./app', { initialUrl: '/reset-password?token=%3Cscript%3E' });
    expect(await screen.findByText('Choose a new password')).toBeTruthy();
    expect(screen.queryByDisplayValue('<script>')).toBeNull();
  });

  it('voics://verify-email?token=... verifies the address and says so', async () => {
    await renderRouter('./app', { initialUrl: `/verify-email?token=${TOKEN}` });
    expect(await screen.findByText('Email verified')).toBeTruthy();
    expect(mockApi.verifyEmail).toHaveBeenCalledWith(TOKEN);
    expect(screen.getByText('Go to sign in')).toBeTruthy();
  });
});

describe('VerifyEmailScreen', () => {
  it('reports a refused token', async () => {
    const api = { verifyEmail: jest.fn().mockRejectedValue(new ApiError(400, 50035, 'This link has expired')) };
    await render(<VerifyEmailScreen api={api} token={TOKEN} />);
    expect(await screen.findByText('This link has expired')).toBeTruthy();
  });

  it('does not call the api for a malformed token', async () => {
    const api = { verifyEmail: jest.fn() };
    await render(<VerifyEmailScreen api={api} token="nope" />);
    expect(await screen.findByText(/link is not valid/)).toBeTruthy();
    expect(api.verifyEmail).not.toHaveBeenCalled();
  });
});
