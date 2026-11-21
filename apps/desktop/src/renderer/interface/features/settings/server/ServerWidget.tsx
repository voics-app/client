import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Permission } from '@discordy/core/contracts/permissions';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { copyText, errorMessage } from '../../../app/actions';
import { useConnectionStore } from '../../../app/connectionStore';
import { getRuntime } from '../../../app/runtime';
import { can, useGuildPermissions } from '../../../shared/hooks/usePermissions';
import { Button } from '../../../shared/ui/Button';
import { Field, Input, Select } from '../../../shared/ui/Form';
import { Skeleton } from '../../../shared/ui/Misc';

/** Text, voice, announcement and stage channels, the types the API accepts as the widget channel. */
const WIDGET_CHANNEL_TYPES = [0, 2, 5, 13];

/** Public JSON of the server widget; it answers 404 while the widget is off. */
export function widgetJsonUrl(apiUrl: string, guildId: string): string {
  return `${apiUrl.replace(/\/+$/, '')}/api/v1/guilds/${guildId}/widget.json`;
}

export function ServerWidget({ guildId }: { guildId: string }) {
  const qc = useQueryClient();
  const allowed = can(useGuildPermissions(guildId), Permission.MANAGE_GUILD);
  const apiUrl = useConnectionStore((s) => s.apiUrl);
  const channelMap = useGuildStore((s) => s.channels);
  const channels = useMemo(
    () => Object.values(channelMap).filter((c) => c.guild_id === guildId && WIDGET_CHANNEL_TYPES.includes(c.type)).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [channelMap, guildId],
  );
  const key = ['guild', guildId, 'widget'];
  const widget = useQuery({ queryKey: key, queryFn: () => getRuntime().api.guildWidgetSettings(guildId), enabled: allowed });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!allowed) return null;

  const save = async (patch: { enabled?: boolean; channel_id?: string | null }) => {
    setSaving(true);
    setError(null);
    try {
      qc.setQueryData(key, await getRuntime().api.updateGuildWidgetSettings(guildId, patch));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const url = widgetJsonUrl(apiUrl, guildId);
  return (
    <div className="settings-page">
      <h1>Widget</h1>
      <p className="page-sub">Publish a read-only summary of this server: its name, online count, the channels everyone can see and an invite to the channel you choose. Members are never listed.</p>
      {widget.isPending ? <Skeleton height={120} radius={12} /> : widget.isError ? (
        <div><p className="field-error" role="alert">Could not load the widget settings. {errorMessage(widget.error)}</p><Button onClick={() => void widget.refetch()}>Try again</Button></div>
      ) : (
        <div className="stack">
          <label className="check-row">
            <input type="checkbox" checked={widget.data.enabled} disabled={saving} onChange={(e) => void save({ enabled: e.target.checked })} /> Enable server widget
          </label>
          <Field label="Invite channel" hint="Visitors get the invite code of an active, non-temporary invite to this channel. Create one under Invites if there is none. The channel must be visible to everyone, otherwise no invite is shown.">
            {(id) => (
              <Select id={id} value={widget.data.channel_id ?? ''} disabled={saving} onChange={(e) => void save({ channel_id: e.target.value || null })}>
                <option value="">No channel</option>
                {channels.map((c) => <option key={c.id} value={c.id}>{c.type === 2 || c.type === 13 ? 'Voice' : 'Text'}: {c.name}</option>)}
              </Select>
            )}
          </Field>
          {error && <p className="field-error" role="alert">{error}</p>}
          {widget.data.enabled ? (
            <Field label="Widget JSON URL" hint="Anyone with this address can read the public summary.">
              {(id) => (
                <div className="invite-link">
                  <Input id={id} readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
                  <Button variant="primary" onClick={() => void copyText(url, 'Widget URL copied')}>Copy</Button>
                </div>
              )}
            </Field>
          ) : (
            <p className="field-hint">The widget is off. Its address answers with not found until you enable it.</p>
          )}
        </div>
      )}
    </div>
  );
}
