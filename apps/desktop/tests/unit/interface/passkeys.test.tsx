// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Passkeys } from '@renderer/interface/features/settings/user/Passkeys';
import { AuthScreen } from '@renderer/interface/features/auth/AuthScreen';
import { ApiError } from '@discordy/core/infrastructure/http/httpClient';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';

const mocks = vi.hoisted(() => ({
  site: { origin: 'https://keys.example.test', rpId: 'example.test' } as { origin: string; rpId: string } | null,
  perform: vi.fn(),
  api: { passkeys: vi.fn(), startPasskeyRegistration: vi.fn(), finishPasskeyRegistration: vi.fn(), renamePasskey: vi.fn(), removePasskey: vi.fn(), me: vi.fn(), startPasskeyLogin: vi.fn() },
  session: { login: vi.fn(), loginPasskey: vi.fn(), loginMfa: vi.fn() },
}));
vi.mock('@renderer/interface/app/runtime', () => ({ getRuntime: () => ({ api: mocks.api, session: mocks.session }) }));
vi.mock('@renderer/interface/app/passkeys', () => ({ usePasskeySite: () => mocks.site, performPasskey: mocks.perform }));
const user = { id: 'u1', username: 'Ada', global_name: null, avatar: null, mfa_enabled: true };
const key = { id: 'key1', name: 'Laptop', created_at: '2026-11-01T12:00:00Z', last_used_at: null };
const credential = { type: 'public-key', id: 'test-credential' };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.site = { origin: 'https://keys.example.test', rpId: 'example.test' };
  mocks.api.passkeys.mockResolvedValue([key]);
  mocks.api.me.mockResolvedValue(user);
  mocks.api.startPasskeyRegistration.mockResolvedValue({ challenge_id: 'challenge', publicKey: { challenge: 'public-options' } });
  mocks.api.startPasskeyLogin.mockResolvedValue({ challenge_id: 'login-challenge', publicKey: { challenge: 'login-options' } });
  mocks.perform.mockResolvedValue(credential);
  useSessionStore.getState().reset();
});
afterEach(cleanup);

async function add() {
  render(<Passkeys user={user} />);
  await screen.findByText('Laptop');
  fireEvent.click(screen.getByRole('button', { name: 'Add passkey' }));
  fireEvent.change(screen.getByLabelText('Passkey name'), { target: { value: 'Work key' } });
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'private-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue in browser' }));
}

describe('passkey account controls', () => {
  it('passes only public options to the browser and displays first-enrollment recovery codes', async () => {
    mocks.api.finishPasskeyRegistration.mockResolvedValue({ passkey: key, backup_codes: [{ code: 'aaaaa-bbbbb', consumed: false }] });
    await add();
    expect(await screen.findByText('aaaaa-bbbbb')).toBeTruthy();
    expect(mocks.api.startPasskeyRegistration).toHaveBeenCalledWith('private-password', 'Work key');
    expect(mocks.perform).toHaveBeenCalledWith('create', { challenge: 'public-options' }, expect.any(AbortSignal));
    expect(mocks.api.finishPasskeyRegistration).toHaveBeenCalledWith({ challenge_id: 'challenge', credential });
  });

  it('leaves enrollment retryable after browser denial without finishing a registration', async () => {
    mocks.perform.mockRejectedValue(new Error('Passkey request cancelled.'));
    await add();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Passkey request cancelled.');
    expect(mocks.api.finishPasskeyRegistration).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Add a passkey' })).toBeTruthy();
  });

  it('aborts a pending browser ceremony when the dialog closes', async () => {
    mocks.perform.mockImplementation((_kind: string, _options: object, signal: AbortSignal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Cancelled')))));
    await add();
    await waitFor(() => expect(mocks.perform).toHaveBeenCalled());
    const signal = mocks.perform.mock.calls[0]![2] as AbortSignal;
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
    expect(signal.aborted).toBe(true);
    expect(mocks.api.finishPasskeyRegistration).not.toHaveBeenCalled();
  });

  it('renames only the selected key and requires password plus factor to remove it', async () => {
    render(<Passkeys user={user} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rename Laptop' }));
    fireEvent.change(screen.getByLabelText('Passkey name'), { target: { value: ' Travel key ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    await waitFor(() => expect(mocks.api.renamePasskey).toHaveBeenCalledWith('key1', 'Travel key'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Laptop' }));
    const remove = screen.getByRole('button', { name: 'Remove passkey' }) as HTMLButtonElement;
    expect(remove.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'pw' } });
    fireEvent.change(screen.getByLabelText('Authenticator or backup code'), { target: { value: 'aaaaa-bbbbb' } });
    fireEvent.click(remove);
    await waitFor(() => expect(mocks.api.removePasskey).toHaveBeenCalledWith('key1', 'pw', 'aaaaa-bbbbb'));
  });

  it('explains missing RP configuration while retaining management and recovery options', async () => {
    mocks.site = null;
    render(<Passkeys user={user} />);
    expect(await screen.findByRole('button', { name: 'Rename Laptop' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Add passkey' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/configured HTTPS ceremony site/)).toBeTruthy();
    expect(mocks.perform).not.toHaveBeenCalled();
  });
});

describe('passkey second-factor sign-in', () => {
  async function passwordStep(methods = ['webauthn', 'backup_code']) {
    mocks.session.login.mockRejectedValue(new ApiError(401, 60008, 'MFA required', undefined, 'private-ticket', methods));
    render(<AuthScreen />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'private-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'Confirm your sign-in' });
  }

  it('keeps the ticket in the app and adopts the server-verified passkey login', async () => {
    await passwordStep();
    fireEvent.click(screen.getByRole('button', { name: 'Use passkey' }));
    await waitFor(() => expect(mocks.session.loginPasskey).toHaveBeenCalled());
    expect(mocks.api.startPasskeyLogin).toHaveBeenCalledWith('private-ticket');
    expect(mocks.perform).toHaveBeenCalledWith('get', { challenge: 'login-options' }, expect.any(AbortSignal));
    expect(mocks.session.loginPasskey).toHaveBeenCalledWith({ ticket: 'private-ticket', challenge_id: 'login-challenge', credential });
  });

  it('allows backup-code recovery after denial without a false sign-in', async () => {
    mocks.perform.mockRejectedValue(new Error('Cancelled by browser'));
    await passwordStep();
    fireEvent.click(screen.getByRole('button', { name: 'Use passkey' }));
    await screen.findByRole('alert');
    expect(mocks.session.loginPasskey).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Authenticator or backup code'), { target: { value: 'aaaaa-bbbbb' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(mocks.session.loginMfa).toHaveBeenCalledWith({ ticket: 'private-ticket', code: 'aaaaa-bbbbb' }));
  });

  it('shows only the factors the API offered', async () => {
    await passwordStep(['totp', 'backup_code']);
    expect(screen.queryByRole('button', { name: 'Use passkey' })).toBeNull();
  });
});
