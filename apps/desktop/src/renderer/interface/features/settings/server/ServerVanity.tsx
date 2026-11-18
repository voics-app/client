import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Permission } from '@discordy/core/contracts/permissions';
import { inviteWebUrl } from '@discordy/core/domain/inviteLinks';
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
    <section className="overview-section" aria-label="Permanent invite">
      <h2>Permanent invite</h2>
      <p className="page-sub">Choose a memorable link for this server. A text channel visible to everyone is required.</p>
      {vanity.isPending ? <p role="status">Loading invitation…</p> : vanity.isError ? (
        <div><p className="field-error" role="alert">Could not load the invitation. {errorMessage(vanity.error)}</p><Button onClick={() => void vanity.refetch()}>Try again</Button></div>
      ) : (
        <>
          <Field label="Invite code" hint="2–32 letters, digits or hyphens. Renaming resets the join count." error={error ?? (!valid ? 'Use 2–32 letters, digits or hyphens.' : null)}>
            {(id) => <Input id={id} value={code} maxLength={32} disabled={saving} invalid={!valid || !!error} autoCapitalize="none" spellCheck={false} onChange={(e) => { setDraft(e.target.value); setError(null); setSaved(false); }} />}
          </Field>
          <div className="row">
            <Button variant="primary" loading={saving} disabled={!dirty || !valid} onClick={() => void save(code || null)}>Save invite</Button>
            {savedCode && <Button disabled={saving} onClick={() => void copyText(inviteWebUrl(savedCode, apiUrl), 'Invite link copied')}>Copy invite link</Button>}
            {vanity.data?.code && <Button variant="ghost" disabled={saving} onClick={() => void save(null)}>Remove invite</Button>}
          </div>
          <p className="field-hint">{vanity.data?.code ? `${vanity.data.uses} successful joins through this code.` : 'No permanent invitation is set.'}</p>
          {saved && <p role="status">Invitation saved.</p>}
        </>
      )}
    </section>
  );
}
