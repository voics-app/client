import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { templateShareLink, templateSummary, usageLabel } from '@discordy/core/domain/templateModel';
import { attempt, copyText, errorMessage } from '../../../app/actions';
import { useConnectionStore } from '../../../app/connectionStore';
import { getRuntime } from '../../../app/runtime';
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
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName(template?.name ?? '');
    setDescription(template?.description ?? '');
  }, [template?.code, template?.name, template?.description]);

  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const run = async <T,>(task: () => Promise<T>, failure: string) => {
    setBusy(true);
    const result = await attempt(task, failure);
    setBusy(false);
    if (result !== undefined) await refresh();
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
            {(id) => <Input id={id} value={name} maxLength={100} disabled={busy} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Field label="Description" hint="Up to 120 characters.">
            {(id) => <Input id={id} value={description} maxLength={120} disabled={busy} onChange={(e) => setDescription(e.target.value)} />}
          </Field>
          <div className="discovery-actions">
            {template ? (
              <>
                <Button variant="primary" loading={busy} disabled={name.trim().length === 0} onClick={() => void run(() => api.modifyGuildTemplate(guildId, template.code, { name: name.trim(), description: description.trim() || null }), 'Could not save the template')}>Save</Button>
                <Button variant="ghost" loading={busy} onClick={() => void run(() => api.syncGuildTemplate(guildId, template.code), 'Could not sync the template')}>Sync with this server</Button>
                <Button variant="ghost" loading={busy} onClick={() => void run(() => api.deleteGuildTemplate(guildId, template.code).then(() => true), 'Could not delete the template')}>Delete template</Button>
              </>
            ) : (
              <Button variant="primary" loading={busy} disabled={name.trim().length === 0} onClick={() => void run(() => api.createGuildTemplate(guildId, { name: name.trim(), description: description.trim() || null }), 'Could not create the template')}>Generate template link</Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
