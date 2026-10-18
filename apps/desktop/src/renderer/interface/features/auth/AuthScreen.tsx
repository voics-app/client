import { ArrowRight, GlobeHemisphereWest, LockKey, Plugs, ShieldCheck } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { useState, type FormEvent } from 'react';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
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

type Mode = 'login' | 'register';

const POINTS = [
  { icon: GlobeHemisphereWest, title: 'Standard', body: 'Servers, history and bots, like you expect.', tone: 'standard' },
  { icon: LockKey, title: 'Ephemeral E2EE', body: 'MLS-encrypted. Relayed, never stored.', tone: 'ephemeral' },
  { icon: Plugs, title: 'Peer-to-peer', body: 'Straight between devices. Zero server copy.', tone: 'p2p' },
] as const;

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showConnection, setShowConnection] = useState(false);
  const fatal = useSessionStore((s) => s.fatalError);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const { session } = getRuntime();
    try {
      if (mode === 'login') await session.login({ email: email.trim(), password, totp: needsTotp ? totp.trim() : undefined });
      else await session.register({ email: email.trim(), username: username.trim(), password });
    } catch (err) {
      if (err instanceof ApiError && err.errors) {
        const flat: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.errors)) {
          const messages = (v as { _errors?: { message: string }[] })._errors;
          if (messages?.[0]) flat[k] = messages[0].message;
        }
        setFieldErrors(flat);
      }
      if (err instanceof ApiError && /totp|two-factor|mfa/i.test(err.message)) setNeedsTotp(true);
      setError(errorMessage(err));
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
            <Segmented label="Mode" value={mode} onChange={(m) => { setMode(m); setError(null); setNeedsTotp(false); }} options={[{ value: 'login', label: 'Sign in' }, { value: 'register', label: 'Create account' }]} />
            <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div key={mode} className="stack" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <Field label="Email" error={fieldErrors.email}>
                  {(id) => <Input id={id} type="email" autoComplete="email" data-autofocus value={email} onChange={(e) => setEmail(e.target.value)} invalid={Boolean(fieldErrors.email)} />}
                </Field>
                {mode === 'register' && (
                  <Field label="Username" error={fieldErrors.username} hint="Lowercase letters, numbers, dots and underscores.">
                    {(id) => <Input id={id} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} invalid={Boolean(fieldErrors.username)} />}
                  </Field>
                )}
                <Field label="Password" error={fieldErrors.password} hint={mode === 'register' ? 'At least 8 characters.' : undefined}>
                  {(id) => <Input id={id} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} invalid={Boolean(fieldErrors.password)} />}
                </Field>
                {needsTotp && (
                  <Field label="Authenticator code">
                    {(id) => <Input id={id} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={totp} onChange={(e) => setTotp(e.target.value)} />}
                  </Field>
                )}
              </motion.div>
            </AnimatePresence>
            {(error || fatal) && <p className="auth-error" role="alert">{error ?? fatal}</p>}
            <Button type="submit" variant="primary" size="lg" block loading={busy} trailing={<ArrowRight size={16} weight="bold" />} disabled={!email || !password || (mode === 'register' && !username)}>
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
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
