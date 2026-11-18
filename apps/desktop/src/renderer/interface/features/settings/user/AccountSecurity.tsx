import { useI18n } from '../../../shared/i18n';
import { ShieldCheck, ShieldWarning } from '@phosphor-icons/react';
import QRCode from 'qrcode';
import { useEffect, useState, type ReactNode } from 'react';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import {
  confirmationMatches,
  groupSecret,
  looksLikeSecondFactor,
  newPasswordProblem,
} from '@discordy/core/domain/accountSecurity';
import type { BackupCode, TotpEnrollment, User } from '@discordy/core/contracts/rest';
import { errorMessage, reportError } from '../../../app/actions';
import { getRuntime } from '../../../app/runtime';
import { Button } from '../../../shared/ui/Button';
import { Field, Input, SettingRow } from '../../../shared/ui/Form';
import { Modal } from '../../../shared/ui/Modal';
import { Passkeys } from './Passkeys';
import { BackupCodesList } from './BackupCodesList';

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

function PasswordField({ value, onChange, label, autoFocus = true }: { value: string; onChange: (v: string) => void; label?: string; autoFocus?: boolean }) {
  const { t: msg } = useI18n();
  return (
    <Field label={label ?? msg("settings.accountsecurity.current.password")}>
      {(id) => <Input id={id} type="password" autoComplete="current-password" data-autofocus={autoFocus || undefined} value={value} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

export function VerifyEmailBanner({ user }: { user: User }) {
  const { t: msg } = useI18n();
  const [token, setToken] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  if (!user.email || user.verified !== false) return null;
  const api = getRuntime().api;
  return (
    <div className="account-banner" role="region" aria-label={msg("settings.accountsecurity.verify.your.email")}>
      <ShieldWarning size={20} weight="fill" />
      <div className="stack grow">
        <strong>{msg('account.verifyEmail', { email: user.email })}</strong>
        <span className="setting-desc">{msg("settings.accountsecurity.check.your.inbox.for.the.code.or.ask.for")}</span>
        <div className="row">
          <Input aria-label={msg("settings.accountsecurity.verification.code")} placeholder={msg("settings.accountsecurity.code.from.the.email")} value={token} onChange={(e) => setToken(e.target.value)} />
          <Button variant="primary" loading={busy} disabled={!token.trim()} onClick={() => void run(async () => {
            await api.verifyEmail(token.trim());
            useSessionStore.getState().setUser(await api.me());
            setToken('');
          }, 'token')}>{msg("settings.accountsecurity.verify")}</Button>
          <Button disabled={busy} onClick={() => void run(async () => { await api.resendVerification(); setMessage(msg("settings.accountsecurity.sent.it.can.take.a.minute")); }, 'email')}>{msg("settings.accountsecurity.resend")}</Button>
        </div>
        {message && !error && <span className="setting-desc">{message}</span>}
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}

type Edit = 'username' | 'email' | 'password';

function EditCredentialModal({ kind, user, onClose }: { kind: Edit; user: User; onClose: () => void }) {
  const { t: msg, locale } = useI18n();
  const editCopy: Record<Edit, { title: string; label: string; button: string }> = {
    username: { title: msg("settings.accountsecurity.change.username"), label: msg("settings.accountsecurity.new.username"), button: msg("settings.accountsecurity.save.username") },
    email: { title: msg("settings.accountsecurity.change.email"), label: msg("settings.accountsecurity.new.email"), button: msg("settings.accountsecurity.send.verification") },
    password: { title: msg("settings.accountsecurity.change.password"), label: msg("settings.accountsecurity.new.password"), button: msg("settings.accountsecurity.change.password") },
  };
  const [value, setValue] = useState(kind === 'username' ? user.username : '');
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const { busy, error, setError, run } = useAction();
  const copy = editCopy[kind];
  const submit = () => {
    if (kind === 'password') {
      const problem = newPasswordProblem(value, confirmation, locale);
      if (problem) return setError(problem);
    }
    const change = kind === 'username' ? { username: value.trim() } : kind === 'email' ? { email: value.trim() } : { new_password: value };
    void run(async () => {
      const updated = await getRuntime().api.changeAccount({ ...change, password });
      useSessionStore.getState().setUser(updated);
      if (kind === 'email') setDone(msg('account.emailSent', { email: value.trim() }));
      else onClose();
    }, kind === 'password' ? 'new_password' : kind);
  };
  return (
    <Modal open onClose={onClose} title={copy.title} footer={done ? <Button variant="primary" onClick={onClose}>{msg("common.done")}</Button> : (
      <><Button onClick={onClose}>{msg("common.cancel")}</Button><Button variant="primary" loading={busy} disabled={!value || !password} onClick={submit}>{copy.button}</Button></>
    )}>
      {done ? <Notice>{done}</Notice> : (
        <div className="stack">
          <Field label={copy.label}>
            {(id) => <Input id={id} type={kind === 'password' ? 'password' : kind === 'email' ? 'email' : 'text'} autoComplete={kind === 'password' ? 'new-password' : 'off'} data-autofocus value={value} onChange={(e) => setValue(e.target.value)} />}
          </Field>
          {kind === 'password' && (
            <Field label={msg("settings.accountsecurity.confirm.new.password")}>{(id) => <Input id={id} type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />}</Field>
          )}
          <PasswordField value={password} onChange={setPassword} autoFocus={false} />
          {kind === 'password' && <span className="setting-desc">{msg("settings.accountsecurity.your.other.sessions.are.signed.out")}</span>}
          {error && <p className="field-error" role="alert">{error}</p>}
        </div>
      )}
    </Modal>
  );
}

function EnableTotpModal({ user, onClose }: { user: User; onClose: () => void }) {
  const { t: msg } = useI18n();
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
      <Modal open onClose={finish} title={msg("settings.accountsecurity.save.your.backup.codes")} description={msg("settings.accountsecurity.each.code.works.once.if.you.lose.your.authenticator")} footer={<Button variant="primary" onClick={finish}>{msg("settings.accountsecurity.i.saved.them")}</Button>}>
        <BackupCodesList codes={codes} username={user.username} />
      </Modal>
    );
  }
  return (
    <Modal open onClose={onClose} title={msg("settings.accountsecurity.set.up.two.factor.authentication")} footer={enrollment ? (
      <><Button onClick={onClose}>{msg("common.cancel")}</Button><Button variant="primary" loading={busy} disabled={code.trim().length !== 6} onClick={() => void run(async () => setCodes(await api.verifyTotp(code.trim())), 'code')}>{msg("settings.accountsecurity.turn.on")}</Button></>
    ) : (
      <><Button onClick={onClose}>{msg("common.cancel")}</Button><Button variant="primary" loading={busy} disabled={!password} onClick={() => void run(async () => setEnrollment(await api.enableTotp(password)))}>{msg("settings.accountsecurity.continue")}</Button></>
    )}>
      {enrollment ? (
        <div className="stack">
          <p className="setting-desc">{msg("settings.accountsecurity.scan.this.with.an.authenticator.app.then.enter.the")}</p>
          {qr && <img className="totp-qr" src={qr} alt={msg("settings.accountsecurity.qr.code.for.the.authenticator.app")} width={192} height={192} />}
          <p className="setting-desc">{msg("settings.accountsecurity.or.enter.this.key.by.hand")} <span className="mono">{groupSecret(enrollment.secret)}</span></p>
          <Field label={msg("settings.accountsecurity.6.digit.code")}>{(id) => <Input id={id} inputMode="numeric" autoComplete="one-time-code" maxLength={6} data-autofocus value={code} onChange={(e) => setCode(e.target.value)} />}</Field>
          {error && <p className="field-error" role="alert">{error}</p>}
        </div>
      ) : (
        <div className="stack">
          <p className="setting-desc">{msg("settings.accountsecurity.confirm.your.password.to.start")}</p>
          <PasswordField value={password} onChange={setPassword} />
          {error && <p className="field-error" role="alert">{error}</p>}
        </div>
      )}
    </Modal>
  );
}

function DisableTotpModal({ onClose }: { onClose: () => void }) {
  const { t: msg } = useI18n();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title={msg("settings.accountsecurity.remove.authenticator.app")} description={msg("settings.accountsecurity.passkeys.remain.active.removing.your.last.second.factor.turns")} footer={
      <><Button onClick={onClose}>{msg("common.cancel")}</Button><Button variant="danger" loading={busy} disabled={!password || !looksLikeSecondFactor(code)} onClick={() => void run(async () => {
        const api = getRuntime().api;
        await api.disableTotp(password, code.trim());
        useSessionStore.getState().setUser(await api.me());
        onClose();
      })}>{msg("settings.accountsecurity.remove.authenticator")}</Button></>
    }>
      <div className="stack">
        <PasswordField value={password} onChange={setPassword} />
        <Field label={msg("settings.accountsecurity.authenticator.or.backup.code")}>{(id) => <Input id={id} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />}</Field>
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}

function BackupCodesModal({ username, onClose }: { username: string; onClose: () => void }) {
  const { t: msg } = useI18n();
  const [password, setPassword] = useState('');
  const [codes, setCodes] = useState<BackupCode[] | null>(null);
  const { busy, error, run } = useAction();
  const load = (regenerate: boolean) => void run(async () => setCodes(await getRuntime().api.backupCodes(password, regenerate)));
  return (
    <Modal open onClose={onClose} title={msg("settings.accountsecurity.backup.codes")} description={msg("settings.accountsecurity.codes.are.stored.hashed.so.only.their.used.state")} footer={codes ? (
      <><Button loading={busy} onClick={() => load(true)}>{msg("settings.accountsecurity.regenerate")}</Button><Button variant="primary" onClick={onClose}>{msg("common.close")}</Button></>
    ) : (
      <><Button onClick={onClose}>{msg("common.cancel")}</Button><Button variant="primary" loading={busy} disabled={!password} onClick={() => load(false)}>{msg("settings.accountsecurity.show.status")}</Button></>
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
  const { t: msg } = useI18n();
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const { busy, error, run } = useAction();
  const deleting = kind === 'delete';
  return (
    <Modal open onClose={onClose} title={deleting ? msg("settings.accountsecurity.delete.your.account") : msg("settings.accountsecurity.disable.your.account")}
      description={deleting ? msg("settings.accountsecurity.your.account.is.removed.after.14.days.signing.in") : msg("settings.accountsecurity.you.are.signed.out.everywhere.signing.in.again.turns")}
      footer={<><Button onClick={onClose}>{msg("common.cancel")}</Button><Button variant="danger" loading={busy} disabled={!password || (deleting && !confirmationMatches(typed, user.username))} onClick={() => void run(async () => {
        const api = getRuntime().api;
        if (deleting) await api.deleteAccount(password); else await api.disableAccount(password);
        onClose();
        useUiStore.getState().openSettings(null);
        await getRuntime().session.logout();
      })}>{deleting ? msg("settings.accountsecurity.delete.account") : msg("settings.accountsecurity.disable.account")}</Button></>}>
      <div className="stack">
        {deleting && <Field label={msg('account.confirmUsername', { name: user.username })}>{(id) => <Input id={id} autoComplete="off" data-autofocus value={typed} onChange={(e) => setTyped(e.target.value)} />}</Field>}
        <PasswordField value={password} onChange={setPassword} autoFocus={!deleting} />
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}

type Dialog = { kind: 'edit'; field: Edit } | { kind: 'enable' } | { kind: 'disable-totp' } | { kind: 'codes' } | { kind: 'leave'; mode: 'disable' | 'delete' } | null;

/** Credential, two-factor and account-lifecycle controls of the My Account page. */
export function AccountSecurity({ user }: { user: User }) {
  const { t: msg } = useI18n();
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const mfa = Boolean(user.mfa_enabled);
  useEffect(() => {
    if (dialog === null) return;
    void getRuntime().api.me().then((me) => useSessionStore.getState().setUser(me)).catch((e) => reportError(e, msg("settings.accountsecurity.could.not.refresh.your.account")));
    // Refresh once when a dialog opens, so a verified email or a toggled factor shows correctly.
  }, [dialog === null]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <VerifyEmailBanner user={user} />
      <SettingRow title={msg("common.username")} searchKey="Username" description={user.username}><Button onClick={() => setDialog({ kind: 'edit', field: 'username' })}>{msg("settings.accountsecurity.edit")}</Button></SettingRow>
      <SettingRow title={msg("settings.accountsecurity.email")} searchKey="Email" description={user.email ?? msg("settings.accountsecurity.no.email.on.this.account")}><Button onClick={() => setDialog({ kind: 'edit', field: 'email' })}>{msg("settings.accountsecurity.edit")}</Button></SettingRow>
      <SettingRow title={msg("settings.accountsecurity.password")} searchKey="Password" description={msg("settings.accountsecurity.changing.it.signs.your.other.sessions.out")}><Button onClick={() => setDialog({ kind: 'edit', field: 'password' })}>{msg("settings.accountsecurity.change")}</Button></SettingRow>
      <SettingRow title={msg("settings.accountsecurity.two.factor.authentication")} searchKey="Two-factor authentication" description={mfa ? msg("settings.accountsecurity.on.use.a.registered.passkey.authenticator.or.backup.code") : msg("settings.accountsecurity.add.a.second.step.with.an.authenticator.app.or")}>
        {mfa ? (
          <div className="row"><Button icon={<ShieldCheck size={16} />} onClick={() => setDialog({ kind: 'codes' })}>{msg("settings.accountsecurity.backup.codes")}</Button></div>
        ) : (
          <Button variant="primary" onClick={() => setDialog({ kind: 'enable' })}>{msg("settings.accountsecurity.turn.on")}</Button>
        )}
      </SettingRow>
      {mfa && <SettingRow title={msg("settings.accountsecurity.authenticator.app")} searchKey="Authenticator app" description={msg("settings.accountsecurity.manage.an.authenticator.independently.of.your.passkeys.existing.factors")}><div className="row"><Button onClick={() => setDialog({ kind: 'enable' })}>{msg("settings.accountsecurity.set.up.authenticator")}</Button><Button onClick={() => setDialog({ kind: 'disable-totp' })}>{msg("settings.accountsecurity.remove.authenticator")}</Button></div></SettingRow>}
      <Passkeys user={user} />
      <SettingRow title={msg("settings.accountsecurity.disable.account")} searchKey="Disable account" description={msg("settings.accountsecurity.sign.out.everywhere.and.hide.your.account.until.you")}><Button variant="danger" onClick={() => setDialog({ kind: 'leave', mode: 'disable' })}>{msg("settings.accountsecurity.disable")}</Button></SettingRow>
      <SettingRow title={msg("settings.accountsecurity.delete.account")} searchKey="Delete account" description={msg("settings.accountsecurity.schedules.deletion.after.14.days")}><Button variant="danger" onClick={() => setDialog({ kind: 'leave', mode: 'delete' })}>{msg("settings.accountsecurity.delete")}</Button></SettingRow>
      {dialog?.kind === 'edit' && <EditCredentialModal kind={dialog.field} user={user} onClose={close} />}
      {dialog?.kind === 'enable' && <EnableTotpModal user={user} onClose={close} />}
      {dialog?.kind === 'disable-totp' && <DisableTotpModal onClose={close} />}
      {dialog?.kind === 'codes' && <BackupCodesModal username={user.username} onClose={close} />}
      {dialog?.kind === 'leave' && <LeaveAccountModal kind={dialog.mode} user={user} onClose={close} />}
    </>
  );
}
