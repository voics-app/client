import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { errorMessage } from '@discordy/core/application/errorMessage';
import { ChannelType } from '@discordy/core/contracts/rest';
import { getRuntime } from '../../../app/runtime';
import { Button } from '../../../shared/ui/Button';
import { Checkbox, Field, Select } from '../../../shared/ui/Form';

type Draft = { enabled: boolean; rules: string; updates: string };

/** Community configuration is independent of opting in to public discovery. */
export function ServerCommunity({ guildId }: { guildId: string }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const allChannels = useGuildStore((s) => s.channels);
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (!guild) return null;
  const original: Draft = { enabled: guild.features?.includes('COMMUNITY') ?? false, rules: guild.rules_channel_id ?? '', updates: guild.public_updates_channel_id ?? '' };
  const value = draft ?? original;
  const channels = Object.values(allChannels).filter((c) => c.guild_id === guildId && (c.type === ChannelType.GUILD_TEXT || c.type === ChannelType.GUILD_ANNOUNCEMENT) && !c.nsfw && (c.delivery_mode ?? 'standard') === 'standard').sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const dirty = value.enabled !== original.enabled || (value.enabled && (value.rules !== original.rules || value.updates !== original.updates));
  const change = (next: Partial<Draft>) => { setDraft({ ...value, ...next }); setSaved(false); };
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await getRuntime().api.updateGuild(guildId, value.enabled
        ? { features: ['COMMUNITY'], rules_channel_id: value.rules, public_updates_channel_id: value.updates }
        : { features: [] });
      useGuildStore.getState().patchGuild(updated);
      setDraft(null);
      setSaved(true);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['guild', guildId, 'discovery'] }),
        qc.invalidateQueries({ queryKey: ['discovery', 'guilds'] }),
      ]);
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  };
  return (
    <section className="overview-section" aria-label="Community setup">
      <h2>Community</h2>
      <p className="page-sub">Choose where members read the rules and where you post community updates. These channels must use Standard delivery and have no age restriction.</p>
      <fieldset disabled={busy} className="stack community-fields">
        <legend className="sr-only">Community settings</legend>
        <Checkbox label="Enable Community" checked={value.enabled} onChange={(enabled) => change({ enabled })} />
        {value.enabled && <>
          {(['rules', 'updates'] as const).map((field) => (
            <Field key={field} label={field === 'rules' ? 'Rules channel' : 'Updates channel'}>
              {(id) => <Select id={id} value={value[field]} onChange={(e) => change({ [field]: e.target.value })}>
                <option value="">Choose a channel</option>
                {value[field] && !channels.some((c) => c.id === value[field]) && <option value={value[field]}>Unavailable channel — choose another</option>}
                {channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
              </Select>}
            </Field>
          ))}
          {channels.length === 0 && <p role="status">Create a Standard text or announcement channel without age restriction to continue.</p>}
        </>}
        {!value.enabled && original.enabled && <p role="status">Saving will clear both Community channels and remove this server from Discover. You can list it again after re-enabling Community.</p>}
        {error && <p className="field-error" role="alert">{error}</p>}
        {saved && <p role="status">Community settings saved.</p>}
        <div className="row-end"><Button variant="primary" loading={busy} disabled={!dirty || (value.enabled && (!channels.some((c) => c.id === value.rules) || !channels.some((c) => c.id === value.updates)))} onClick={() => void save()}>Save Community</Button></div>
      </fieldset>
    </section>
  );
}
