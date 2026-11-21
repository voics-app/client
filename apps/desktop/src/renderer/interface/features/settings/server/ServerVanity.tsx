import { useI18n } from '../../../shared/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Permission } from '@discordy/core/contracts/permissions';
import { inviteWebUrl } from '@discordy/core/domain/inviteLinks';
import { useStreamerActive } from '../../../app/streamer';
import { copyText, errorMessage } from '../../../app/actions';
import { useConnectionStore } from '../../../app/connectionStore';
import { getRuntime } from '../../../app/runtime';
import { can, useGuildPermissions } from '../../../shared/hooks/usePermissions';
import { Button } from '../../../shared/ui/Button';
import { Field, Input } from '../../../shared/ui/Form';

function inviteError(error: unknown): string {
  const errors = (error as { errors?: { code?: { _errors?: { message?: unknown }[] } } } | null)?.errors;
  const message = errors?.code?._errors?.[0]?.message;
  return typeof message === 'string' ? message : errorMessage(error);
}

export function ServerVanity({ guildId }: { guildId: string }) {
  const { t: msg } = useI18n();
  const streamer = useStreamerActive();
  const qc = useQueryClient();
  const allowed = can(useGuildPermissions(guildId), Permission.MANAGE_GUILD);
  const apiUrl = useConnectionStore((s) => s.apiUrl);
  const key = ['guild', guildId, 'vanity-url'];
  const vanity = useQuery({ queryKey: key, queryFn: () => getRuntime().api.guildVanityUrl(guildId), enabled: allowed });
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (!allowed) return null;
  if (streamer) return <section className="overview-section" aria-label="Permanent invite"><h2>Permanent invite</h2><p>Hidden in streamer mode.</p></section>;
  const code = draft ?? vanity.data?.code ?? '';
  const savedCode = vanity.data?.code;
  const dirty = code.toLowerCase() !== (vanity.data?.code ?? '');
  const valid = code === '' || /^[a-z0-9-]{2,32}$/i.test(code);

  const save = async (next: string | null) => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await getRuntime().api.updateGuildVanityUrl(guildId, next);
      qc.setQueryData(key, result);
      setDraft(null);
      setSaved(true);
    } catch (cause) {
      setError(inviteError(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="overview-section" aria-label={msg("settings.servervanity.permanent.invite")}>
      <h2>{msg("settings.servervanity.permanent.invite")}</h2>
      <p className="page-sub">{msg("settings.servervanity.choose.a.memorable.link.for.this.server.a.text")}</p>
      {vanity.isPending ? <p role="status">{msg("settings.servervanity.loading.invitation")}</p> : vanity.isError ? (
        <div><p className="field-error" role="alert">{msg("settings.servervanity.could.not.load.the.invitation")} {errorMessage(vanity.error)}</p><Button onClick={() => void vanity.refetch()}>{msg("common.retry")}</Button></div>
      ) : (
        <>
          <Field label={msg("settings.servervanity.invite.code")} hint={msg("settings.servervanity.2.32.letters.digits.or.hyphens.renaming.resets.the")} error={error ?? (!valid ? msg("settings.servervanity.use.2.32.letters.digits.or.hyphens") : null)}>
            {(id) => <Input id={id} value={code} maxLength={32} disabled={saving} invalid={!valid || !!error} autoCapitalize="none" spellCheck={false} onChange={(e) => { setDraft(e.target.value); setError(null); setSaved(false); }} />}
          </Field>
          <div className="row">
            <Button variant="primary" loading={saving} disabled={!dirty || !valid} onClick={() => void save(code || null)}>{msg("settings.servervanity.save.invite")}</Button>
            {savedCode && <Button disabled={saving} onClick={() => void copyText(inviteWebUrl(savedCode, apiUrl), msg("settings.servertabs.invite.link.copied"))}>{msg("settings.servervanity.copy.invite.link")}</Button>}
            {vanity.data?.code && <Button variant="ghost" disabled={saving} onClick={() => void save(null)}>{msg("settings.servervanity.remove.invite")}</Button>}
          </div>
          <p className="field-hint">{vanity.data?.code ? msg("server.vanityUses", { count: vanity.data.uses }) : msg("settings.servervanity.no.permanent.invitation.is.set")}</p>
          {saved && <p role="status">{msg("settings.servervanity.invitation.saved")}</p>}
        </>
      )}
    </section>
  );
}
