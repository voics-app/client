import { useI18n } from '../../../shared/i18n';
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
import { BackupCodesList } from './BackupCodesList';

type Edit = { kind: 'add' } | { kind: 'rename' | 'remove'; key: Passkey };

function PasskeyModal({ edit, user, origin, onClose, onChanged }: { edit: Edit; user: User; origin?: string; onClose: () => void; onChanged: () => void }) {
  const { t: msg } = useI18n();
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
  const title = edit.kind === 'add' ? msg("settings.passkeys.add.a.passkey") : edit.kind === 'rename' ? msg("settings.passkeys.rename.passkey") : msg("settings.passkeys.remove.passkey");
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
  return <Modal open onClose={close} title={phase === 'done' ? msg("settings.passkeys.passkey.added") : title} footer={phase === 'done'
    ? <Button variant="primary" onClick={close}>{msg("common.done")}</Button>
    : <><Button disabled={phase === 'saving'} onClick={close}>{phase === 'browser' ? msg("friends.cancelRequest") : msg("common.cancel")}</Button><Button variant={edit.kind === 'remove' ? 'danger' : 'primary'} loading={busy} disabled={!valid || busy} onClick={() => void submit()}>{edit.kind === 'add' ? msg("settings.passkeys.continue.in.browser") : edit.kind === 'rename' ? msg("settings.passkeys.save.name") : msg("settings.passkeys.remove.passkey")}</Button></>}>
    <div className="stack">
      {phase === 'done' ? <>
        <p>{msg("settings.passkeys.your.passkey.is.ready.sign.in.with.your.password")}</p>
        {codes.length > 0 ? <><p>{msg("settings.passkeys.save.these.backup.codes.somewhere.safe.they.are.shown")}</p><BackupCodesList codes={codes} username={user.username} /></> : <p>{msg("settings.passkeys.your.existing.authenticator.and.backup.codes.still.work")}</p>}
      </> : <>
        {edit.kind === 'add' && <p className="setting-desc">{msg('passkeys.browser', { origin: origin ?? '' })}</p>}
        {edit.kind === 'remove' && <p className="setting-desc">{msg('passkeys.removeHelp', { name: edit.key.name })}</p>}
        {edit.kind !== 'remove' && <Field label={msg("settings.passkeys.passkey.name")} hint={msg("settings.passkeys.for.example.work.laptop.or.security.key")}>{id => <Input id={id} data-autofocus value={name} disabled={busy} onChange={event => setName(event.target.value)} />}</Field>}
        {edit.kind !== 'rename' && <Field label={msg("settings.accountsecurity.current.password")}>{id => <Input id={id} type="password" autoComplete="current-password" value={password} disabled={busy} onChange={event => setPassword(event.target.value)} />}</Field>}
        {edit.kind === 'remove' && <Field label={msg("settings.accountsecurity.authenticator.or.backup.code")}>{id => <Input id={id} autoComplete="one-time-code" value={code} disabled={busy} onChange={event => setCode(event.target.value)} />}</Field>}
        {phase === 'browser' && <p role="status">{msg("settings.passkeys.continue.in.your.browser.keep.this.dialog.open.you")}</p>}
        {phase === 'saving' && <p role="status">{msg("settings.passkeys.saving.your.change")}</p>}
        {error && <p className="field-error" role="alert">{error}</p>}
      </>}
    </div>
  </Modal>;
}

export function Passkeys({ user }: { user: User }) {
  const { t: msg } = useI18n();
  const { locale } = useI18n();
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
  return <section aria-label={msg("settings.passkeys.passkeys")}>
    <SettingRow title={msg("settings.passkeys.passkeys")} description={msg("settings.passkeys.use.your.device.lock.or.a.security.key.as")}>
      <Button disabled={!site || keys === null || keys.length >= 10} onClick={() => setEdit({ kind: 'add' })}>{msg("settings.passkeys.add.passkey")}</Button>
    </SettingRow>
    {site === null && <p className="setting-desc">{msg("settings.passkeys.passkey.enrollment.needs.a.configured.https.ceremony.site.for")}</p>}
    {error ? <p className="field-error" role="alert">{error} <Button onClick={() => setRevision(value => value + 1)}>{msg("chat.retry")}</Button></p> : keys === null ? <p role="status">{msg("settings.passkeys.loading.passkeys")}</p> : keys.length === 0 ? <p className="setting-desc">{msg("settings.passkeys.no.passkeys.added.yet")}</p> : <ul className="passkey-list">
      {keys.map(key => <li key={key.id}><SettingRow title={key.name} description={`${msg('passkeys.added', { date: new Date(key.created_at).toLocaleDateString(locale) })} ${key.last_used_at ? msg('passkeys.lastUsed', { date: new Date(key.last_used_at).toLocaleDateString(locale) }) : msg("settings.passkeys.not.used.yet")}`}><div className="row"><Button aria-label={msg('passkeys.rename', { name: key.name })} onClick={() => setEdit({ kind: 'rename', key })}>{msg("settings.passkeys.rename")}</Button><Button variant="danger" aria-label={msg('files.remove', { name: key.name })} onClick={() => setEdit({ kind: 'remove', key })}>{msg("common.remove")}</Button></div></SettingRow></li>)}
    </ul>}
    {keys?.length === 10 && <p className="setting-desc">{msg("settings.passkeys.you.have.ten.passkeys.remove.one.before.adding.another")}</p>}
    {edit && <PasskeyModal edit={edit} user={user} origin={site?.origin} onClose={() => setEdit(null)} onChanged={() => setRevision(value => value + 1)} />}
  </section>;
}
