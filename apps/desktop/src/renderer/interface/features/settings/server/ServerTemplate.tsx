import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { templateShareLink, templateSummary, usageLabel } from '@discordy/core/domain/templateModel';
import { attempt, copyText, errorMessage } from '../../../app/actions';
import { useConnectionStore } from '../../../app/connectionStore';
import { getRuntime } from '../../../app/runtime';
import { useUnsavedChanges } from '../../../shared/hooks/useUnsavedChanges';
import { Button } from '../../../shared/ui/Button';
import { Field, Input } from '../../../shared/ui/Form';
import { Skeleton } from '../../../shared/ui/Misc';

/** Share this server's structure as a template link (one template per server). */
export function ServerTemplate({ guildId }: { guildId: string }) {
  const qc = useQueryClient();
  const apiUrl = useConnectionStore((s) => s.apiUrl);
  const key = ['guild', guildId, 'templates'];
  const templates = useQuery({ queryKey: key, queryFn: () => getRuntime().api.guildTemplates(guildId) });
  const template = templates.data?.[0] ?? null;
  const [draft, setDraft] = useState<{ guildId: string; name: string; description: string } | null>(null);
  const currentDraft = draft?.guildId === guildId ? draft : null;
  const name = currentDraft?.name ?? template?.name ?? '';
  const description = currentDraft?.description ?? template?.description ?? '';
  const dirty = currentDraft !== null && (name !== (template?.name ?? '') || description !== (template?.description ?? ''));
  const [busy, setBusy] = useState(false);
  useUnsavedChanges(dirty || busy);

  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const run = async <T,>(task: () => Promise<T>, failure: string, options: { resetDraft?: boolean } = {}) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await attempt(task, failure);
      if (result !== undefined) {
        await refresh();
        if (options.resetDraft) setDraft((current) => current?.guildId === guildId ? null : current);
      }
    } finally {
      setBusy(false);
    }
  };
  const api = getRuntime().api;
  const link = template ? templateShareLink(template.code, apiUrl) : '';

  return (
    <div className="settings-page">
      <h1>Server template</h1>
      <p className="page-sub">Share this server&apos;s channels and roles. Anyone with the link can start a new server from it; members and messages are never copied.</p>
      {templates.isPending ? (
        <Skeleton height={120} radius={12} />
      ) : templates.isError ? (
        <div><p role="alert">Could not load this server&apos;s template. {errorMessage(templates.error)}</p><Button onClick={() => void templates.refetch()}>Try again</Button></div>
      ) : (
        <div className="stack">
          {template && (
            <>
              <p className="setting-desc">{templateSummary(template)} · {usageLabel(template.usage_count)}</p>
              {template.is_dirty && <p role="status">This server has changed. Sync to update the channels and roles in the shared template.</p>}
              <div className="invite-link">
                <Input readOnly aria-label="Template link" value={link} onFocus={(e) => e.currentTarget.select()} />
                <Button variant="primary" onClick={() => void copyText(link, 'Template link copied')}>Copy</Button>
              </div>
            </>
          )}
          <Field label="Template name">
            {(id) => <Input id={id} value={name} maxLength={100} disabled={busy} onChange={(e) => setDraft({ guildId, name: e.target.value, description })} />}
          </Field>
          <Field label="Description" hint="Up to 120 characters.">
            {(id) => <Input id={id} value={description} maxLength={120} disabled={busy} onChange={(e) => setDraft({ guildId, name, description: e.target.value })} />}
          </Field>
          {dirty && <p className="setting-desc" role="status">You have unsaved template changes. Save or reset before leaving.</p>}
          <div className="discovery-actions">
            {template ? (
              <>
                <Button variant="primary" loading={busy} disabled={name.trim().length === 0} onClick={() => void run(() => api.modifyGuildTemplate(guildId, template.code, { name: name.trim(), description: description.trim() || null }), 'Could not save the template', { resetDraft: true })}>Save</Button>
                <Button variant="ghost" loading={busy} onClick={() => void run(() => api.syncGuildTemplate(guildId, template.code), 'Could not sync the template')}>Sync with this server</Button>
                <Button variant="ghost" loading={busy} onClick={() => void run(() => api.deleteGuildTemplate(guildId, template.code).then(() => true), 'Could not delete the template', { resetDraft: true })}>Delete template</Button>
              </>
            ) : (
              <Button variant="primary" loading={busy} disabled={name.trim().length === 0} onClick={() => void run(() => api.createGuildTemplate(guildId, { name: name.trim(), description: description.trim() || null }), 'Could not create the template', { resetDraft: true })}>Generate template link</Button>
            )}
            {dirty && <Button variant="ghost" disabled={busy} onClick={() => setDraft(null)}>Reset</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
