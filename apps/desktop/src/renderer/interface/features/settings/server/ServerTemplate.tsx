import { useI18n } from '../../../shared/i18n';
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
  const { t: msg, locale } = useI18n();
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
      <h1>{msg("settings.servertemplate.server.template")}</h1>
      <p className="page-sub">{msg("settings.servertemplate.share.this.server.s.channels.and.roles.anyone.with")}</p>
      {templates.isPending ? (
        <Skeleton height={120} radius={12} />
      ) : templates.isError ? (
        <div><p role="alert">{msg("settings.servertemplate.could.not.load.this.server.s.template")} {errorMessage(templates.error)}</p><Button onClick={() => void templates.refetch()}>{msg("common.retry")}</Button></div>
      ) : (
        <div className="stack">
          {template && (
            <>
              <p className="setting-desc">{templateSummary(template, locale)} · {usageLabel(template.usage_count, locale)}</p>
              {template.is_dirty && <p role="status">{msg("settings.servertemplate.this.server.has.changed.sync.to.update.the.channels")}</p>}
              <div className="invite-link">
                <Input readOnly aria-label={msg("settings.servertemplate.template.link")} value={link} onFocus={(e) => e.currentTarget.select()} />
                <Button variant="primary" onClick={() => void copyText(link, msg("settings.servertemplate.template.link.copied"))}>{msg("settings.backupcodeslist.copy")}</Button>
              </div>
            </>
          )}
          <Field label={msg("settings.servertemplate.template.name")}>
            {(id) => <Input id={id} value={name} maxLength={100} disabled={busy} onChange={(e) => setDraft({ guildId, name: e.target.value, description })} />}
          </Field>
          <Field label={msg("settings.serveroverview.description")} hint={msg("settings.servertemplate.up.to.120.characters")}>
            {(id) => <Input id={id} value={description} maxLength={120} disabled={busy} onChange={(e) => setDraft({ guildId, name, description: e.target.value })} />}
          </Field>
          {dirty && <p className="setting-desc" role="status">{msg("settings.servertemplate.you.have.unsaved.template.changes.save.or.reset.before")}</p>}
          <div className="discovery-actions">
            {template ? (
              <>
                <Button variant="primary" loading={busy} disabled={name.trim().length === 0} onClick={() => void run(() => api.modifyGuildTemplate(guildId, template.code, { name: name.trim(), description: description.trim() || null }), msg("settings.servertemplate.could.not.save.the.template"), { resetDraft: true })}>{msg("common.save")}</Button>
                <Button variant="ghost" loading={busy} onClick={() => void run(() => api.syncGuildTemplate(guildId, template.code), msg("settings.servertemplate.could.not.sync.the.template"))}>{msg("settings.servertemplate.sync.with.this.server")}</Button>
                <Button variant="ghost" loading={busy} onClick={() => void run(() => api.deleteGuildTemplate(guildId, template.code).then(() => true), msg("settings.servertemplate.could.not.delete.the.template"), { resetDraft: true })}>{msg("settings.servertemplate.delete.template")}</Button>
              </>
            ) : (
              <Button variant="primary" loading={busy} disabled={name.trim().length === 0} onClick={() => void run(() => api.createGuildTemplate(guildId, { name: name.trim(), description: description.trim() || null }), msg("settings.servertemplate.could.not.create.the.template"), { resetDraft: true })}>{msg("settings.servertemplate.generate.template.link")}</Button>
            )}
            {dirty && <Button variant="ghost" disabled={busy} onClick={() => setDraft(null)}>{msg("common.reset")}</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
