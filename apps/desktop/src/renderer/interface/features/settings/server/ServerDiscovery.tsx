import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { blockerMessage, categoryLabel, memberCountLabel, parseTags } from '@discordy/core/domain/discoveryModel';
import { attempt } from '../../../app/actions';
import { getRuntime } from '../../../app/runtime';
import { Button } from '../../../shared/ui/Button';
import { Field, Input, Select } from '../../../shared/ui/Form';
import { Skeleton } from '../../../shared/ui/Misc';
import { ServerCommunity } from './ServerCommunity';

export function ServerDiscovery({ guildId }: { guildId: string }) {
  const qc = useQueryClient();
  const key = ['guild', guildId, 'discovery'];
  const settings = useQuery({ queryKey: key, queryFn: () => getRuntime().api.guildDiscovery(guildId) });
  const categories = useQuery({ queryKey: ['discovery', 'categories'], queryFn: () => getRuntime().api.discoveryCategories(), staleTime: 300_000 });
  const [draft, setDraft] = useState<{ guildId: string; category: string; tags: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const data = settings.data;
  const value = draft?.guildId === guildId ? draft : { guildId, category: data?.category ?? '', tags: data?.tags.join(', ') ?? '' };
  const { category, tags } = value;
  const change = (next: Partial<Pick<typeof value, 'category' | 'tags'>>) => setDraft({ ...value, ...next });

  const save = async (enabled: boolean) => {
    setSaving(true);
    const updated = await attempt(() => getRuntime().api.putGuildDiscovery(guildId, { enabled, category: category || null, tags: parseTags(tags) }), enabled ? 'Could not list this server' : 'Could not remove the listing');
    setSaving(false);
    if (updated) {
      qc.setQueryData(key, updated);
      setDraft((current) => current?.guildId === guildId ? null : current);
      void qc.invalidateQueries({ queryKey: ['discovery', 'guilds'] });
    }
  };

  return (
    <div className="settings-page">
      <h1>Server discovery</h1>
      <p className="page-sub">List this server in Discover so anyone can find and join it.</p>
      <ServerCommunity guildId={guildId} />
      {settings.isError ? <div role="alert"><p>Could not load discovery settings.</p><Button onClick={() => void settings.refetch()}>Retry</Button></div> : !data ? (
        <Skeleton height={120} radius={12} />
      ) : (
        <div className="stack">
          <p className="setting-desc">
            {data.enabled ? (data.blockers.length ? 'This listing is paused until the requirements below are met.' : 'This server is listed in Discover.') : 'This server is not listed.'} {memberCountLabel(data.member_count)}.
          </p>
          {data.blockers.length > 0 && (
            <ul className="discovery-blockers" role="status">
              {data.blockers.map((b) => <li key={b}>{blockerMessage(b)}</li>)}
            </ul>
          )}
          <Field label="Category">
            {(id) => (
              <Select id={id} disabled={saving} value={category} onChange={(e) => change({ category: e.target.value })}>
                <option value="">Choose a category</option>
                {categories.data?.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Tags" hint="Up to 5, separated by commas or spaces. Letters, digits and dashes.">
            {(id) => <Input id={id} disabled={saving} value={tags} placeholder="rust, open-source" onChange={(e) => change({ tags: e.target.value })} />}
          </Field>
          <div className="discovery-actions">
            <Button variant="primary" loading={saving} disabled={!category || data.blockers.length > 0} onClick={() => void save(true)}>
              {data.enabled ? 'Save listing' : 'List in Discover'}
            </Button>
            {data.enabled && <Button variant="ghost" loading={saving} onClick={() => void save(false)}>Remove from Discover</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
