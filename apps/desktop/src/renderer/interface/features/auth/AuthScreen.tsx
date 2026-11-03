import { ArrowRight, GlobeHemisphereWest, LockKey, Plugs, ShieldCheck } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { useState, type FormEvent } from 'react';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import { authErrorDisplay } from '@renderer/domain/authErrors';
import { ApiError } from '@renderer/infrastructure/http/httpClient';
import { errorMessage } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { Button } from '../../shared/ui/Button';
import { Eyebrow } from '../../shared/ui/Misc';
import { Field, Input } from '../../shared/ui/Form';
import { gentle } from '../../shared/ui/motion';
import { Segmented } from '../../shared/ui/Form';
import { ConnectionPicker } from './ConnectionPicker';
import { BRAND } from '@shared/brand';

/** Form fields that can show their own error; any other error key goes to the banner. */
const AUTH_FIELDS = ['email', 'password', 'username', 'code', 'token'];

type Mode = 'login' | 'register' | 'forgot' | 'reset';

/** Discord's code for "two-factor required"; the answer carries a ticket for the second step. */
const MFA_REQUIRED = 60008;

const POINTS = [
  { icon: GlobeHemisphereWest, title: 'Standard', body: 'Servers, history and bots, like you expect.', tone: 'standard' },
  { icon: LockKey, title: 'Ephemeral E2EE', body: 'MLS-encrypted. Relayed, never stored.', tone: 'ephemeral' },
  { icon: Plugs, title: 'Peer-to-peer', body: 'Straight between devices. Zero server copy.', tone: 'p2p' },
] as const;

const HEADINGS: Record<Mode, string> = {
  login: 'Welcome back',
  register: 'Create your account',
  forgot: 'Forgot your password?',
  reset: 'Choose a new password',
};

const SUBMIT: Record<Mode, string> = {
  login: 'Sign in',
  register: 'Create account',
  forgot: 'Email me a reset code',
  reset: 'Change password',
};

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [ticket, setTicket] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showConnection, setShowConnection] = useState(false);
  const fatal = useSessionStore((s) => s.fatalError);

  const canSubmit = ticket
    ? Boolean(code.trim())
    : mode === 'forgot'
      ? Boolean(email)
      : mode === 'reset'
        ? Boolean(resetToken && password)
        : Boolean(email && password && (mode !== 'register' || username));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const { session } = getRuntime();
    try {
      if (mode === 'forgot') {
        await getRuntime().api.forgotPassword(email.trim());
        setNotice('If that address has an account, a reset code is on its way. Paste it below.');
        setMode('reset');
      } else if (mode === 'reset') {
        await getRuntime().api.resetPassword(resetToken.trim(), password);
        setPassword('');
        setNotice('Password changed. Sign in with the new one.');
        setMode('login');
      } else if (mode === 'login' && ticket) await session.loginMfa({ ticket, code: code.trim() });
      else if (mode === 'login') await session.login({ email: email.trim(), password });
      else await session.register({ email: email.trim(), username: username.trim(), password });
    } catch (err) {
      let general: string | null = null;
      if (err instanceof ApiError && err.errors) {
        const shown = authErrorDisplay(err.errors, AUTH_FIELDS);
        setFieldErrors(shown.fields);
        general = shown.general;
      }
      if (err instanceof ApiError && err.code === MFA_REQUIRED && err.ticket) {
        setTicket(err.ticket);
        setError(null);
        return;
      }
      setError(general ?? errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="titlebar-drag" />
      <aside className="auth-hero" aria-hidden="false">
        <div className="orb orb-a" /><div className="orb orb-b" />
        <div className="auth-hero-inner">
          <Eyebrow>{BRAND.displayName}</Eyebrow>
          <h1>Talk the way you want to be heard.</h1>
          <p>Chat, voice, video and screen share with three delivery modes. The mode is always visible, never hidden.</p>
          <ul className="auth-points">
            {POINTS.map((p, i) => (
              <motion.li key={p.title} className={`auth-point mode-${p.tone}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...gentle, delay: 0.15 + i * 0.08 }}>
                <span className="auth-point-icon"><p.icon size={20} weight={p.tone === 'standard' ? 'regular' : 'fill'} /></span>
                <span><strong>{p.title}</strong><span>{p.body}</span></span>
              </motion.li>
            ))}
          </ul>
        </div>
      </aside>
      <main className="auth-panel">
        <div className="auth-card-shell">
          <form className="auth-card" onSubmit={submit} noValidate>
            <Segmented label="Mode" value={mode} onChange={(m) => { setMode(m); setError(null); setNotice(null); setTicket(null); setCode(''); }} options={[{ value: 'login', label: 'Sign in' }, { value: 'register', label: 'Create account' }]} />
            <h2>{HEADINGS[mode]}</h2>
            {notice && <p className="auth-notice" role="status">{notice}</p>}
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div key={mode} className="stack" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                {ticket ? (
                  <Field label="Authenticator or backup code" error={fieldErrors.code} hint="Open your authenticator app, or enter one of your backup codes.">
                    {(id) => <Input id={id} autoComplete="one-time-code" data-autofocus value={code} onChange={(e) => setCode(e.target.value)} invalid={Boolean(fieldErrors.code)} />}
                  </Field>
                ) : (<>
                {mode !== 'reset' && (
                <Field label="Email" error={fieldErrors.email}>
                  {(id) => <Input id={id} type="email" autoComplete="email" data-autofocus value={email} onChange={(e) => setEmail(e.target.value)} invalid={Boolean(fieldErrors.email)} />}
                </Field>
                )}
                {mode === 'reset' && (
                  <Field label="Reset code" error={fieldErrors.token} hint="From the email we sent you.">
                    {(id) => <Input id={id} autoComplete="off" data-autofocus value={resetToken} onChange={(e) => setResetToken(e.target.value)} invalid={Boolean(fieldErrors.token)} />}
                  </Field>
                )}
                {mode === 'register' && (
                  <Field label="Username" error={fieldErrors.username} hint="Lowercase letters, numbers, dots and underscores.">
                    {(id) => <Input id={id} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} invalid={Boolean(fieldErrors.username)} />}
                  </Field>
                )}
                {mode !== 'forgot' && (
                <Field label={mode === 'reset' ? 'New password' : 'Password'} error={fieldErrors.password} hint={mode === 'login' ? undefined : 'At least 8 characters.'}>
                  {(id) => <Input id={id} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} invalid={Boolean(fieldErrors.password)} />}
                </Field>
                )}
                </>)}
              </motion.div>
            </AnimatePresence>
            {(error || fatal) && <p className="auth-error" role="alert">{error ?? fatal}</p>}
            <Button type="submit" variant="primary" size="lg" block loading={busy} trailing={<ArrowRight size={16} weight="bold" />} disabled={!canSubmit}>
              {SUBMIT[mode]}
            </Button>
            {mode === 'login' && !ticket && <button type="button" className="link-btn" onClick={() => { setMode('forgot'); setError(null); setNotice(null); }}>Forgot password?</button>}
            {(mode === 'forgot' || mode === 'reset' || ticket) && <button type="button" className="link-btn" onClick={() => { setMode('login'); setTicket(null); setCode(''); setError(null); setNotice(null); }}>Back to sign in</button>}
            <p className="auth-foot">
              <ShieldCheck size={14} /> Your session is stored in the OS keychain.
              <button type="button" className="link-btn" onClick={() => setShowConnection(true)}>Connection</button>
            </p>
          </form>
        </div>
      </main>
      <ConnectionPicker open={showConnection} onClose={() => setShowConnection(false)} />
    </div>
  );
}
