import { useI18n } from '../../shared/i18n';
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
  const { t: msg, locale } = useI18n();
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
  const nameError = webhookNameError(draft.name, locale);
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
  const rotate = () => hook && useUiStore.getState().openDialog({ kind: 'confirm', title: msg("settings.webhookeditor.regenerate.webhook.url"), body: msg("settings.webhookeditor.the.old.url.stops.working.immediately.update.every.service"), confirmLabel: msg("settings.webhookeditor.regenerate.url"), danger: true, onConfirm: async () => {
    const result = await getRuntime().api.resetWebhookToken(hook.id);
    if (alive.current) { setCredential(result.url); onSaved(); }
  } });
  const remove = () => hook && useUiStore.getState().openDialog({ kind: 'confirm', title: msg('integrations.deleteHook', { name: hook.name ?? msg('settings.serverintegrations.webhook') }), body: msg("settings.webhookeditor.its.execution.url.will.stop.working.this.cannot.be"), confirmLabel: msg("settings.webhookeditor.delete.webhook"), danger: true, onConfirm: async () => {
    await getRuntime().api.deleteWebhook(hook.id);
    if (alive.current) { setCredential(null); onSaved(); onClose(); }
  } });
  return <section className="webhook-editor" aria-label={msg("settings.webhookeditor.webhook.editor")}>
    <div className="integration-section-heading"><h3>{hook ? msg('integrations.editHook', { name: hook.name ?? msg('settings.serverintegrations.webhook') }) : msg("settings.webhookeditor.create.webhook")}</h3><Button size="sm" variant="ghost" disabled={busy || reading || dirty} onClick={onClose}>{msg("settings.webhookeditor.close.editor")}</Button></div>
    <form className="integration-stack" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <Field label={msg("settings.webhookeditor.webhook.name")} error={touched ? nameError : null}>{(id) => <Input id={id} value={draft.name} maxLength={160} disabled={busy} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />}</Field>
      <Field label={msg("settings.webhookeditor.channel")}>{(id) => <Select id={id} value={draft.channelId} disabled={busy} onChange={(event) => setDraft({ ...draft, channelId: event.target.value })}>
        {!draft.channelId && <option value="">{msg("settings.webhookeditor.choose.a.channel")}</option>}
        {hook?.channel_id && !channels.some((channel) => channel.id === hook.channel_id) && <option value={hook.channel_id}>{msg("settings.webhookeditor.current.channel.unavailable")}</option>}
        {channels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
      </Select>}</Field>
      <div className="webhook-avatar"><div className="webhook-avatar-preview">{draft.avatar ? <img src={draft.avatar} alt={msg("settings.webhookeditor.new.webhook.avatar.preview")} /> : <Avatar id={hook?.id} name={draft.name || msg("settings.serverintegrations.webhook")} avatar={draft.avatar === null ? null : hook?.avatar} size={56} />}</div><div><Button size="sm" icon={<Upload size={14} />} disabled={busy || reading} onClick={() => fileRef.current?.click()}>{msg("settings.webhookeditor.upload.avatar")}</Button><Button size="sm" variant="ghost" disabled={busy || reading || !(draft.avatar === undefined ? hook?.avatar : draft.avatar)} onClick={() => setDraft({ ...draft, avatar: null })}>{msg("profile.removeAvatar")}</Button><p className="field-hint">{msg("settings.webhookeditor.png.jpeg.gif.or.webp.up.to.10.mb")}</p>{reading && <p role="status">{msg("settings.profileeditor.reading.image")}</p>}{imageError && <p className="field-error" role="alert">{imageError}</p>}<input ref={fileRef} hidden type="file" aria-label={msg("settings.webhookeditor.webhook.avatar")} accept="image/png,image/jpeg,image/gif,image/webp" onChange={(event) => { void pickImage(event.target.files?.[0]); event.target.value = ''; }} /></div></div>
      <div className="row-end"><Button variant="ghost" disabled={busy || !dirty} onClick={reset}>{msg("settings.webhookeditor.reset.changes")}</Button><Button type="submit" variant="primary" loading={busy} disabled={reading || !draft.channelId || (hook !== null && !dirty)}>{hook ? msg("settings.webhookeditor.save.webhook") : msg("settings.webhookeditor.create.webhook")}</Button></div>
    </form>
    {hook && <div className="webhook-credentials">
      <h3>{msg("settings.webhookeditor.execution.url")}</h3>
      {credential ? <><p className="field-hint">{msg("settings.webhookeditor.anyone.with.this.url.can.send.messages.as.the")}</p><Input readOnly value={credential} aria-label={msg("settings.webhookeditor.webhook.execution.url")} autoComplete="off" spellCheck={false} onFocus={(event) => event.currentTarget.select()} /><div className="row"><Button size="sm" icon={<Copy size={14} />} onClick={() => void copyText(credential, msg("settings.webhookeditor.webhook.url.copied"))}>{msg("settings.webhookeditor.copy.url")}</Button><Button size="sm" variant="ghost" onClick={() => setCredential(null)}>{msg("settings.webhookeditor.hide.url")}</Button></div></> : <p className="field-hint">{msg("settings.webhookeditor.existing.urls.cannot.be.recovered.regenerate.a.url.to")}</p>}
      <div className="row"><Button size="sm" disabled={busy || dirty || reading} onClick={rotate}>{msg("settings.webhookeditor.regenerate.url")}</Button>{canAudit && <Button size="sm" variant="ghost" onClick={() => openIntegrationAudit(guildId, hook.id, hook.name ?? msg("settings.serverintegrations.webhook"))}>{msg("domain.view.audit.log")}</Button>}<Button size="sm" variant="danger" disabled={busy || dirty || reading} onClick={remove}>{msg("settings.webhookeditor.delete.webhook")}</Button></div>
    </div>}
    <UnsavedBar dirty={dirty} saving={busy || reading} error={error ? msg('integrations.saveError', { error }) : null} onReset={reset} onSave={() => void save()} />
  </section>;
}
