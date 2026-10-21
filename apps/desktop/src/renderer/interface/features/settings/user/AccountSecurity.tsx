import { Copy, DownloadSimple, ShieldCheck, ShieldWarning } from '@phosphor-icons/react';
import QRCode from 'qrcode';
import { useEffect, useState, type ReactNode } from 'react';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import {
  backupCodesFile,
  confirmationMatches,
  groupSecret,
  looksLikeSecondFactor,
  newPasswordProblem,
} from '@renderer/domain/accountSecurity';
import type { BackupCode, TotpEnrollment, User } from '@shared/contracts/rest';
import { BRAND } from '@shared/brand';
import { copyText, errorMessage, reportError } from '../../../app/actions';
import { getRuntime } from '../../../app/runtime';
import { Button } from '../../../shared/ui/Button';
import { Field, Input, SettingRow } from '../../../shared/ui/Form';
import { Modal } from '../../../shared/ui/Modal';

/** Field-level message from an API error envelope, falling back to its summary. */
function fieldMessage(error: unknown, field: string): string {
  const errors = (error as { errors?: Record<string, { _errors?: { message: string }[] }> }).errors;
  return errors?.[field]?._errors?.[0]?.message ?? errorMessage(error);
}

function Notice({ children }: { children: ReactNode }) {
  return <p className="auth-notice" role="status">{children}</p>;
}

/** Runs `action`, keeping the dialog open and showing the error on failure. */
function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<void>, field = 'password') => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(fieldMessage(e, field));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

function PasswordField({ value, onChange, label = 'Current password', autoFocus = true }: { value: string; onChange: (v: string) => void; label?: string; autoFocus?: boolean }) {
  return (
    <Field label={label}>
      {(id) => <Input id={id} type="password" autoComplete="current-password" data-autofocus={autoFocus || undefined} value={value} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

export function VerifyEmailBanner({ user }: { user: User }) {
  const [token, setToken] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  if (!user.email || user.verified !== false) return null;
  const api = getRuntime().api;
  return (
    <div className="account-banner" role="region" aria-label="Verify your email">
      <ShieldWarning size={20} weight="fill" />
      <div className="stack grow">
        <strong>Verify {user.email}</strong>
        <span className="setting-desc">Check your inbox for the code, or ask for a new one.</span>
        <div className="row">
          <Input aria-label="Verification code" placeholder="Code from the email" value={token} onChange={(e) => setToken(e.target.value)} />
          <Button variant="primary" loading={busy} disabled={!token.trim()} onClick={() => void run(async () => {
            await api.verifyEmail(token.trim());
            useSessionStore.getState().setUser(await api.me());
            setToken('');
          }, 'token')}>Verify</Button>
          <Button disabled={busy} onClick={() => void run(async () => { await api.resendVerification(); setMessage('Sent. It can take a minute.'); }, 'email')}>Resend</Button>
        </div>
        {message && !error && <span className="setting-desc">{message}</span>}
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}

type Edit = 'username' | 'email' | 'password';

const EDIT_COPY: Record<Edit, { title: string; label: string; button: string }> = {
  username: { title: 'Change username', label: 'New username', button: 'Save username' },
  email: { title: 'Change email', label: 'New email', button: 'Send verification' },
  password: { title: 'Change password', label: 'New password', button: 'Change password' },
};

function EditCredentialModal({ kind, user, onClose }: { kind: Edit; user: User; onClose: () => void }) {
  const [value, setValue] = useState(kind === 'username' ? user.username : '');
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const { busy, error, setError, run } = useAction();
  const copy = EDIT_COPY[kind];
  const submit = () => {
    if (kind === 'password') {
      const problem = newPasswordProblem(value, confirmation);
      if (problem) return setError(problem);
    }
    const change = kind === 'username' ? { username: value.trim() } : kind === 'email' ? { email: value.trim() } : { new_password: value };
    void run(async () => {
      const updated = await getRuntime().api.changeAccount({ ...change, password });
      useSessionStore.getState().setUser(updated);
      if (kind === 'email') setDone(`We sent a verification code to ${value.trim()}. Your email changes once you verify it.`);
      else onClose();
    }, kind === 'password' ? 'new_password' : kind);
  };
  return (
    <Modal open onClose={onClose} title={copy.title} footer={done ? <Button variant="primary" onClick={onClose}>Done</Button> : (
      <><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!value || !password} onClick={submit}>{copy.button}</Button></>
    )}>
      {done ? <Notice>{done}</Notice> : (
        <div className="stack">
          <Field label={copy.label}>
            {(id) => <Input id={id} type={kind === 'password' ? 'password' : kind === 'email' ? 'email' : 'text'} autoComplete={kind === 'password' ? 'new-password' : 'off'} data-autofocus value={value} onChange={(e) => setValue(e.target.value)} />}
          </Field>
          {kind === 'password' && (
            <Field label="Confirm new password">{(id) => <Input id={id} type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />}</Field>
          )}
          <PasswordField value={password} onChange={setPassword} autoFocus={false} />
          {kind === 'password' && <span className="setting-desc">Your other sessions are signed out.</span>}
          {error && <p className="field-error" role="alert">{error}</p>}
        </div>
      )}
    </Modal>
  );
}

export function BackupCodesList({ codes, username }: { codes: BackupCode[]; username: string }) {
  const plain = codes.flatMap((c) => (c.code ? [c.code] : []));
  const download = () => {
    const url = URL.createObjectURL(new Blob([backupCodesFile(plain, username, BRAND.displayName)], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${BRAND.displayName.toLowerCase()}-backup-codes.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="stack">
      <ul className="backup-codes mono">
        {codes.map((c, i) => <li key={c.code ?? i} className={c.consumed ? 'is-used' : undefined}>{c.code ?? (c.consumed ? 'used' : 'unused')}</li>)}
      </ul>
      {plain.length > 0 && (
        <div className="row">
          <Button icon={<Copy size={16} />} onClick={() => void copyText(plain.join('\n'), 'Backup codes copied')}>Copy</Button>
          <Button icon={<DownloadSimple size={16} />} onClick={download}>Download</Button>
        </div>
      )}
    </div>
  );
}

function EnableTotpModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<BackupCode[] | null>(null);
  const { busy, error, run } = useAction();
  useEffect(() => {
    if (!enrollment) return;
    let live = true;
    void QRCode.toDataURL(enrollment.otpauth_uri, { margin: 1, width: 192 }).then((url) => live && setQr(url));
    return () => { live = false; };
  }, [enrollment]);
  const api = getRuntime().api;
  const finish = () => {
    void api.me().then((me) => useSessionStore.getState().setUser(me)).catch(() => undefined);
    onClose();
  };
  if (codes) {
    return (
      <Modal open onClose={finish} title="Save your backup codes" description="Each code works once if you lose your authenticator. They are not shown again." footer={<Button variant="primary" onClick={finish}>I saved them</Button>}>
        <BackupCodesList codes={codes} username={user.username} />
      </Modal>
    );
  }
  return (
    <Modal open onClose={onClose} title="Set up two-factor authentication" footer={enrollment ? (
      <><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={code.trim().length !== 6} onClick={() => void run(async () => setCodes(await api.verifyTotp(code.trim())), 'code')}>Turn on</Button></>
    ) : (
      <><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!password} onClick={() => void run(async () => setEnrollment(await api.enableTotp(password)))}>Continue</Button></>
    )}>
      {enrollment ? (
        <div className="stack">
          <p className="setting-desc">Scan this with an authenticator app, then enter the 6-digit code it shows.</p>
          {qr && <img className="totp-qr" src={qr} alt="QR code for the authenticator app" width={192} height={192} />}
          <p className="setting-desc">Or enter this key by hand: <span className="mono">{groupSecret(enrollment.secret)}</span></p>
          <Field label="6-digit code">{(id) => <Input id={id} inputMode="numeric" autoComplete="one-time-code" maxLength={6} data-autofocus value={code} onChange={(e) => setCode(e.target.value)} />}</Field>
          {error && <p className="field-error" role="alert">{error}</p>}
        </div>
      ) : (
        <div className="stack">
          <p className="setting-desc">Confirm your password to start.</p>
          <PasswordField value={password} onChange={setPassword} />
          {error && <p className="field-error" role="alert">{error}</p>}
        </div>
      )}
    </Modal>
  );
}

function DisableTotpModal({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title="Turn off two-factor authentication" footer={
      <><Button onClick={onClose}>Cancel</Button><Button variant="danger" loading={busy} disabled={!password || !looksLikeSecondFactor(code)} onClick={() => void run(async () => {
        const api = getRuntime().api;
        await api.disableTotp(password, code.trim());
        useSessionStore.getState().setUser(await api.me());
        onClose();
      })}>Turn off</Button></>
    }>
      <div className="stack">
        <PasswordField value={password} onChange={setPassword} />
        <Field label="Authenticator or backup code">{(id) => <Input id={id} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />}</Field>
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}

function BackupCodesModal({ username, onClose }: { username: string; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [codes, setCodes] = useState<BackupCode[] | null>(null);
  const { busy, error, run } = useAction();
  const load = (regenerate: boolean) => void run(async () => setCodes(await getRuntime().api.backupCodes(password, regenerate)));
  return (
    <Modal open onClose={onClose} title="Backup codes" description="Codes are stored hashed, so only their used state can be shown. Regenerate to get a fresh set." footer={codes ? (
      <><Button loading={busy} onClick={() => load(true)}>Regenerate</Button><Button variant="primary" onClick={onClose}>Close</Button></>
    ) : (
      <><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!password} onClick={() => load(false)}>Show status</Button></>
    )}>
      {codes ? <BackupCodesList codes={codes} username={username} /> : (
        <div className="stack">
          <PasswordField value={password} onChange={setPassword} />
          {error && <p className="field-error" role="alert">{error}</p>}
        </div>
      )}
      {codes && error && <p className="field-error" role="alert">{error}</p>}
    </Modal>
  );
}

function LeaveAccountModal({ kind, user, onClose }: { kind: 'disable' | 'delete'; user: User; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const { busy, error, run } = useAction();
  const deleting = kind === 'delete';
  return (
    <Modal open onClose={onClose} title={deleting ? 'Delete your account' : 'Disable your account'}
      description={deleting ? 'Your account is removed after 14 days. Signing in again before then cancels it. You must hand over any servers you own first.' : 'You are signed out everywhere. Signing in again turns your account back on.'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" loading={busy} disabled={!password || (deleting && !confirmationMatches(typed, user.username))} onClick={() => void run(async () => {
        const api = getRuntime().api;
        if (deleting) await api.deleteAccount(password); else await api.disableAccount(password);
        onClose();
        useUiStore.getState().openSettings(null);
        await getRuntime().session.logout();
      })}>{deleting ? 'Delete account' : 'Disable account'}</Button></>}>
      <div className="stack">
        {deleting && <Field label={`Type ${user.username} to confirm`}>{(id) => <Input id={id} autoComplete="off" data-autofocus value={typed} onChange={(e) => setTyped(e.target.value)} />}</Field>}
        <PasswordField value={password} onChange={setPassword} autoFocus={!deleting} />
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}

type Dialog = { kind: 'edit'; field: Edit } | { kind: 'enable' } | { kind: 'disable-totp' } | { kind: 'codes' } | { kind: 'leave'; mode: 'disable' | 'delete' } | null;

/** Credential, two-factor and account-lifecycle controls of the My Account page. */
export function AccountSecurity({ user }: { user: User }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const mfa = Boolean(user.mfa_enabled);
  useEffect(() => {
    if (dialog === null) return;
    void getRuntime().api.me().then((me) => useSessionStore.getState().setUser(me)).catch((e) => reportError(e, 'Could not refresh your account'));
    // Refresh once when a dialog opens, so a verified email or a toggled factor shows correctly.
  }, [dialog === null]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <VerifyEmailBanner user={user} />
      <SettingRow title="Username" description={user.username}><Button onClick={() => setDialog({ kind: 'edit', field: 'username' })}>Edit</Button></SettingRow>
      <SettingRow title="Email" description={user.email ?? 'No email on this account'}><Button onClick={() => setDialog({ kind: 'edit', field: 'email' })}>Edit</Button></SettingRow>
      <SettingRow title="Password" description="Changing it signs your other sessions out."><Button onClick={() => setDialog({ kind: 'edit', field: 'password' })}>Change</Button></SettingRow>
      <SettingRow title="Two-factor authentication" description={mfa ? 'On. Sign-in asks for a code from your authenticator app.' : 'Add a second step to sign-in with an authenticator app.'}>
        {mfa ? (
          <div className="row"><Button icon={<ShieldCheck size={16} />} onClick={() => setDialog({ kind: 'codes' })}>Backup codes</Button><Button variant="danger" onClick={() => setDialog({ kind: 'disable-totp' })}>Turn off</Button></div>
        ) : (
          <Button variant="primary" onClick={() => setDialog({ kind: 'enable' })}>Turn on</Button>
        )}
      </SettingRow>
      <SettingRow title="Disable account" description="Sign out everywhere and hide your account until you sign in again."><Button variant="danger" onClick={() => setDialog({ kind: 'leave', mode: 'disable' })}>Disable</Button></SettingRow>
      <SettingRow title="Delete account" description="Schedules deletion after 14 days."><Button variant="danger" onClick={() => setDialog({ kind: 'leave', mode: 'delete' })}>Delete</Button></SettingRow>
      {dialog?.kind === 'edit' && <EditCredentialModal kind={dialog.field} user={user} onClose={close} />}
      {dialog?.kind === 'enable' && <EnableTotpModal user={user} onClose={close} />}
      {dialog?.kind === 'disable-totp' && <DisableTotpModal onClose={close} />}
      {dialog?.kind === 'codes' && <BackupCodesModal username={user.username} onClose={close} />}
      {dialog?.kind === 'leave' && <LeaveAccountModal kind={dialog.mode} user={user} onClose={close} />}
    </>
  );
}
