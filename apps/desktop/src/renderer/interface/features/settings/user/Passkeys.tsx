import { useEffect, useRef, useState } from 'react';
import type { BackupCode, Passkey, User } from '@discordy/core/contracts/rest';
import { looksLikeSecondFactor } from '@discordy/core/domain/accountSecurity';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { errorMessage } from '../../../app/actions';
import { performPasskey, usePasskeySite } from '../../../app/passkeys';
import { getRuntime } from '../../../app/runtime';
import { Button } from '../../../shared/ui/Button';
import { Field, Input, SettingRow } from '../../../shared/ui/Form';
import { Modal } from '../../../shared/ui/Modal';
import { BackupCodesList } from './AccountSecurity';

type Edit = { kind: 'add' } | { kind: 'rename' | 'remove'; key: Passkey };

function PasskeyModal({ edit, user, origin, onClose, onChanged }: { edit: Edit; user: User; origin?: string; onClose: () => void; onChanged: () => void }) {
  const [name, setName] = useState(edit.kind === 'add' ? '' : edit.key.name);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<'idle' | 'browser' | 'saving' | 'done'>('idle');
  const [codes, setCodes] = useState<BackupCode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  const close = () => {
    if (phase === 'saving') return;
    operation.current?.abort();
    onClose();
  };
  const busy = phase === 'browser' || phase === 'saving';
  const title = edit.kind === 'add' ? 'Add a passkey' : edit.kind === 'rename' ? 'Rename passkey' : 'Remove passkey';
  const validName = name.trim().length > 0 && [...name.trim()].length <= 64 && [...name].every(char => char.charCodeAt(0) >= 32 && (char.charCodeAt(0) < 127 || char.charCodeAt(0) > 159));
  const valid = edit.kind === 'remove' ? Boolean(password && looksLikeSecondFactor(code)) : validName && (edit.kind === 'rename' || Boolean(password));
  const submit = async () => {
    const controller = new AbortController();
    operation.current = controller;
    setError(null);
    setPhase(edit.kind === 'add' ? 'browser' : 'saving');
    const api = getRuntime().api;
    try {
      if (edit.kind === 'add') {
        const challenge = await api.startPasskeyRegistration(password, name.trim());
        setPassword('');
        const credential = await performPasskey('create', challenge.publicKey, controller.signal);
        controller.signal.throwIfAborted();
        setPhase('saving');
        const registration = await api.finishPasskeyRegistration({ challenge_id: challenge.challenge_id, credential });
        setCodes(registration.backup_codes ?? []);
        setPhase('done');
        // Recovery codes remain visible even if refreshing the account fails afterwards.
        void api.me().then(me => useSessionStore.getState().setUser(me)).catch(() => undefined);
      } else if (edit.kind === 'rename') {
        await api.renamePasskey(edit.key.id, name.trim());
        onClose();
      } else {
        await api.removePasskey(edit.key.id, password, code.trim());
        void api.me().then(me => useSessionStore.getState().setUser(me)).catch(() => undefined);
        onClose();
      }
      onChanged();
    } catch (failure) {
      if (!controller.signal.aborted) { setError(errorMessage(failure)); setPhase('idle'); }
    }
  };
  return <Modal open onClose={close} title={phase === 'done' ? 'Passkey added' : title} footer={phase === 'done'
    ? <Button variant="primary" onClick={close}>Done</Button>
    : <><Button disabled={phase === 'saving'} onClick={close}>{phase === 'browser' ? 'Cancel request' : 'Cancel'}</Button><Button variant={edit.kind === 'remove' ? 'danger' : 'primary'} loading={busy} disabled={!valid || busy} onClick={() => void submit()}>{edit.kind === 'add' ? 'Continue in browser' : edit.kind === 'rename' ? 'Save name' : 'Remove passkey'}</Button></>}>
    <div className="stack">
      {phase === 'done' ? <>
        <p>Your passkey is ready. Sign in with your password, then select Use passkey.</p>
        {codes.length > 0 ? <><p>Save these backup codes somewhere safe. They are shown only once and let you sign in if you lose your passkey.</p><BackupCodesList codes={codes} username={user.username} /></> : <p>Your existing authenticator and backup codes still work.</p>}
      </> : <>
        {edit.kind === 'add' && <p className="setting-desc">Your default browser will open {origin}. Use your device lock, a security key or a passkey on another device.</p>}
        {edit.kind === 'remove' && <p className="setting-desc">Remove “{edit.key.name}” from this account. This does not delete it from your device. Confirm with your password and an authenticator or backup code. Removing the last second factor turns MFA off.</p>}
        {edit.kind !== 'remove' && <Field label="Passkey name" hint="For example: Work laptop or Security key">{id => <Input id={id} data-autofocus value={name} disabled={busy} onChange={event => setName(event.target.value)} />}</Field>}
        {edit.kind !== 'rename' && <Field label="Current password">{id => <Input id={id} type="password" autoComplete="current-password" value={password} disabled={busy} onChange={event => setPassword(event.target.value)} />}</Field>}
        {edit.kind === 'remove' && <Field label="Authenticator or backup code">{id => <Input id={id} autoComplete="one-time-code" value={code} disabled={busy} onChange={event => setCode(event.target.value)} />}</Field>}
        {phase === 'browser' && <p role="status">Continue in your browser. Keep this dialog open; you can cancel here.</p>}
        {phase === 'saving' && <p role="status">Saving your change…</p>}
        {error && <p className="field-error" role="alert">{error}</p>}
      </>}
    </div>
  </Modal>;
}

export function Passkeys({ user }: { user: User }) {
  const site = usePasskeySite();
  const [keys, setKeys] = useState<Passkey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [edit, setEdit] = useState<Edit | null>(null);
  useEffect(() => {
    let active = true;
    setError(null);
    void getRuntime().api.passkeys().then(value => { if (active) setKeys(value); }).catch(failure => { if (active) setError(errorMessage(failure)); });
    return () => { active = false; };
  }, [revision, user.id]);
  return <section aria-label="Passkeys">
    <SettingRow title="Passkeys" description="Use your device lock or a security key as the second step after your password.">
      <Button disabled={!site || keys === null || keys.length >= 10} onClick={() => setEdit({ kind: 'add' })}>Add passkey</Button>
    </SettingRow>
    {site === null && <p className="setting-desc">Passkey enrollment needs a configured HTTPS ceremony site for this connection. Existing passkeys can still be renamed or removed. Authenticator and backup codes remain available for sign-in.</p>}
    {error ? <p className="field-error" role="alert">{error} <Button onClick={() => setRevision(value => value + 1)}>Retry</Button></p> : keys === null ? <p role="status">Loading passkeys…</p> : keys.length === 0 ? <p className="setting-desc">No passkeys added yet.</p> : <ul className="passkey-list">
      {keys.map(key => <li key={key.id}><SettingRow title={key.name} description={`Added ${new Date(key.created_at).toLocaleDateString()}. ${key.last_used_at ? `Last used ${new Date(key.last_used_at).toLocaleDateString()}.` : 'Not used yet.'}`}><div className="row"><Button aria-label={`Rename ${key.name}`} onClick={() => setEdit({ kind: 'rename', key })}>Rename</Button><Button variant="danger" aria-label={`Remove ${key.name}`} onClick={() => setEdit({ kind: 'remove', key })}>Remove</Button></div></SettingRow></li>)}
    </ul>}
    {keys?.length === 10 && <p className="setting-desc">You have ten passkeys. Remove one before adding another.</p>}
    {edit && <PasskeyModal edit={edit} user={user} origin={site?.origin} onClose={() => setEdit(null)} onChanged={() => setRevision(value => value + 1)} />}
  </section>;
}
