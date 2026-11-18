import { Copy, Upload } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import type { Channel, Webhook } from '@discordy/core/contracts/rest';
import { webhookNameError, webhookPatch, type WebhookDraft } from '@discordy/core/domain/integrations';
import { copyText, errorMessage } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { Field, Input, Select } from '../../shared/ui/Form';
import { UnsavedBar } from '../../shared/ui/UnsavedBar';
import { readImageUpload } from '../settings/imageUpload';
import { openIntegrationAudit } from './integrationActions';

/** Credentials remain only in this editor's memory and disappear on close or selection change. */
export function WebhookEditor({ guildId, initial, channels, canAudit, onClose, onSaved }: { guildId: string; initial: Webhook | null; channels: Channel[]; canAudit: boolean; onClose: () => void; onSaved: () => void }) {
  const [hook, setHook] = useState(initial);
  const baseline = (value: Webhook | null): WebhookDraft => ({ name: value?.name ?? '', channelId: value?.channel_id ?? channels[0]?.id ?? '' });
  const [draft, setDraft] = useState(() => baseline(initial));
  const [credential, setCredential] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [touched, setTouched] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const imageRead = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; imageRead.current += 1; }; }, []);
  const patch = hook ? webhookPatch(hook, draft) : null;
  const dirty = hook ? Object.keys(patch!).length > 0 : draft.name !== '' || draft.avatar !== undefined;
  const nameError = webhookNameError(draft.name);
  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    const version = ++imageRead.current;
    setReading(true); setImageError(null);
    try { const avatar = await readImageUpload(file); if (alive.current && version === imageRead.current) setDraft((current) => ({ ...current, avatar })); }
    catch (reason) { if (alive.current && version === imageRead.current) setImageError(errorMessage(reason)); }
    finally { if (alive.current && version === imageRead.current) setReading(false); }
  };
  const save = async () => {
    setTouched(true);
    if (nameError || !draft.channelId || reading) return;
    setBusy(true); setError(null);
    try {
      const result = hook ? await getRuntime().api.updateWebhook(hook.id, patch!) : await getRuntime().api.createWebhook(draft.channelId, { name: draft.name.trim(), ...(draft.avatar ? { avatar: draft.avatar } : {}) });
      if (!alive.current) return;
      // Strip secret response fields before retaining metadata or invalidating ordinary lists.
      const metadata: Webhook = { id: result.id, type: result.type, guild_id: result.guild_id, channel_id: result.channel_id, name: result.name, avatar: result.avatar, application_id: result.application_id };
      if ('url' in result && typeof result.url === 'string') setCredential(result.url);
      setHook(metadata); setDraft(baseline(metadata)); setTouched(false); onSaved();
    } catch (reason) { if (alive.current) setError(errorMessage(reason)); }
    finally { if (alive.current) setBusy(false); }
  };
  const reset = () => { imageRead.current += 1; setReading(false); setDraft(baseline(hook)); setError(null); setImageError(null); setTouched(false); };
  const rotate = () => hook && useUiStore.getState().openDialog({ kind: 'confirm', title: 'Regenerate webhook URL?', body: 'The old URL stops working immediately. Update every service using this webhook with the new URL. It will be shown only once.', confirmLabel: 'Regenerate URL', danger: true, onConfirm: async () => {
    const result = await getRuntime().api.resetWebhookToken(hook.id);
    if (alive.current) { setCredential(result.url); onSaved(); }
  } });
  const remove = () => hook && useUiStore.getState().openDialog({ kind: 'confirm', title: `Delete ${hook.name ?? 'webhook'}?`, body: 'Its execution URL will stop working. This cannot be undone.', confirmLabel: 'Delete webhook', danger: true, onConfirm: async () => {
    await getRuntime().api.deleteWebhook(hook.id);
    if (alive.current) { setCredential(null); onSaved(); onClose(); }
  } });
  return <section className="webhook-editor" aria-label="Webhook editor">
    <div className="integration-section-heading"><h3>{hook ? `Edit ${hook.name}` : 'Create webhook'}</h3><Button size="sm" variant="ghost" disabled={busy || reading || dirty} onClick={onClose}>Close editor</Button></div>
    <form className="integration-stack" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <Field label="Webhook name" error={touched ? nameError : null}>{(id) => <Input id={id} value={draft.name} maxLength={160} disabled={busy} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />}</Field>
      <Field label="Channel">{(id) => <Select id={id} value={draft.channelId} disabled={busy} onChange={(event) => setDraft({ ...draft, channelId: event.target.value })}>
        {!draft.channelId && <option value="">Choose a channel</option>}
        {hook?.channel_id && !channels.some((channel) => channel.id === hook.channel_id) && <option value={hook.channel_id}>Current channel (unavailable)</option>}
        {channels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
      </Select>}</Field>
      <div className="webhook-avatar"><div className="webhook-avatar-preview">{draft.avatar ? <img src={draft.avatar} alt="New webhook avatar preview" /> : <Avatar id={hook?.id} name={draft.name || 'Webhook'} avatar={draft.avatar === null ? null : hook?.avatar} size={56} />}</div><div><Button size="sm" icon={<Upload size={14} />} disabled={busy || reading} onClick={() => fileRef.current?.click()}>Upload avatar</Button><Button size="sm" variant="ghost" disabled={busy || reading || !(draft.avatar === undefined ? hook?.avatar : draft.avatar)} onClick={() => setDraft({ ...draft, avatar: null })}>Remove avatar</Button><p className="field-hint">PNG, JPEG, GIF or WebP, up to 10 MB.</p>{reading && <p role="status">Reading image…</p>}{imageError && <p className="field-error" role="alert">{imageError}</p>}<input ref={fileRef} hidden type="file" aria-label="Webhook avatar" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(event) => { void pickImage(event.target.files?.[0]); event.target.value = ''; }} /></div></div>
      <div className="row-end"><Button variant="ghost" disabled={busy || !dirty} onClick={reset}>Reset changes</Button><Button type="submit" variant="primary" loading={busy} disabled={reading || !draft.channelId || (hook !== null && !dirty)}>{hook ? 'Save webhook' : 'Create webhook'}</Button></div>
    </form>
    {hook && <div className="webhook-credentials">
      <h3>Execution URL</h3>
      {credential ? <><p className="field-hint">Anyone with this URL can send messages as the webhook. Copy it now; leaving this editor hides it.</p><Input readOnly value={credential} aria-label="Webhook execution URL" autoComplete="off" spellCheck={false} onFocus={(event) => event.currentTarget.select()} /><div className="row"><Button size="sm" icon={<Copy size={14} />} onClick={() => void copyText(credential, 'Webhook URL copied')}>Copy URL</Button><Button size="sm" variant="ghost" onClick={() => setCredential(null)}>Hide URL</Button></div></> : <p className="field-hint">Existing URLs cannot be recovered. Regenerate a URL to reveal a new one.</p>}
      <div className="row"><Button size="sm" disabled={busy || dirty || reading} onClick={rotate}>Regenerate URL</Button>{canAudit && <Button size="sm" variant="ghost" onClick={() => openIntegrationAudit(guildId, hook.id, hook.name ?? 'Webhook')}>View audit log</Button>}<Button size="sm" variant="danger" disabled={busy || dirty || reading} onClick={remove}>Delete webhook</Button></div>
    </div>}
    <UnsavedBar dirty={dirty} saving={busy || reading} error={error ? `Could not save webhook. ${error}` : null} onReset={reset} onSave={() => void save()} />
  </section>;
}
