import { useI18n } from '../../../shared/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Permission } from '@discordy/core/contracts/permissions';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { errorMessage } from '../../../app/actions';
import { getRuntime } from '../../../app/runtime';
import { can, useGuildPermissions } from '../../../shared/hooks/usePermissions';
import { Button } from '../../../shared/ui/Button';
import { Field, Select, SettingRow, Switch } from '../../../shared/ui/Form';

type Policy = { audit_log_enabled: boolean; audit_log_retention_days: 30 | 90 | 365 };

export function ServerAuditPolicy({ guildId }: { guildId: string }) {
  const { t: msg } = useI18n();
  const qc = useQueryClient();
  const allowed = can(useGuildPermissions(guildId), Permission.ADMINISTRATOR);
  const key = ['guild', guildId, 'audit-policy'];
  const guild = useQuery({ queryKey: key, queryFn: () => getRuntime().api.guild(guildId) });
  const [draft, setDraft] = useState<Policy | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const current: Policy = { audit_log_enabled: guild.data?.audit_log_enabled ?? true, audit_log_retention_days: guild.data?.audit_log_retention_days ?? 90 };
  const policy = draft ?? current;
  const dirty = policy.audit_log_enabled !== current.audit_log_enabled || policy.audit_log_retention_days !== current.audit_log_retention_days;
  const change = (patch: Partial<Policy>) => { setDraft({ ...policy, ...patch }); setSaved(false); setError(null); };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await getRuntime().api.updateGuild(guildId, policy);
      qc.setQueryData(key, result);
      useGuildStore.getState().patchGuild({ id: guildId, audit_log_enabled: result.audit_log_enabled, audit_log_retention_days: result.audit_log_retention_days });
      await qc.invalidateQueries({ queryKey: ['guild', guildId, 'audit'] });
      setDraft(null);
      setSaved(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  if (guild.isPending) return <p role="status">{msg("settings.serverauditpolicy.loading.audit.settings")}</p>;
  if (guild.isError) return <div><p className="field-error" role="alert">{msg("settings.serverauditpolicy.could.not.load.audit.settings")} {errorMessage(guild.error)}</p><Button onClick={() => void guild.refetch()}>{msg("common.retry")}</Button></div>;
  return (
    <section className="overview-section" aria-label={msg("settings.serverauditpolicy.audit.settings")}>
      <SettingRow title={msg("settings.serverauditpolicy.record.audit.log")} description={msg("settings.serverauditpolicy.record.moderation.and.server.changes.changes.to.these.audit")}>
        <Switch label={msg("settings.serverauditpolicy.record.audit.log")} checked={policy.audit_log_enabled} disabled={!allowed || saving} onChange={(on) => change({ audit_log_enabled: on })} />
      </SettingRow>
      {!current.audit_log_enabled && <p role="status">{msg("settings.serverauditpolicy.audit.logging.is.off.earlier.entries.remain.available.until")}</p>}
      <Field label={msg("settings.serverauditpolicy.keep.audit.entries")} hint={msg("settings.serverauditpolicy.older.entries.are.removed.automatically.shortening.this.period.removes")}>
        {(id) => <Select id={id} value={policy.audit_log_retention_days} disabled={!allowed || saving} onChange={(e) => change({ audit_log_retention_days: Number(e.target.value) as Policy['audit_log_retention_days'] })}>
          {[30, 90, 365].map((days) => <option value={days} key={days}>{msg("common.days", { count: days })}</option>)}
        </Select>}
      </Field>
      <p className="field-hint">{msg("settings.serverauditpolicy.roles.with.view.audit.log.can.read.entries.only")}</p>
      {error && <p className="field-error" role="alert">{error}</p>}
      {allowed && <div className="row"><Button variant="primary" loading={saving} disabled={!dirty} onClick={() => void save()}>{msg("settings.serverauditpolicy.save.audit.settings")}</Button>{dirty && <Button variant="ghost" disabled={saving} onClick={() => { setDraft(null); setError(null); }}>{msg("common.reset")}</Button>}</div>}
      {saved && <p role="status">{msg("settings.serverauditpolicy.audit.settings.saved")}</p>}
    </section>
  );
}
