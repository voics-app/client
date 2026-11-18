import { useI18n } from '../../../shared/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { blockerMessage, categoryLabel, memberCountLabel, parseTags } from '@discordy/core/domain/discoveryModel';
import { attempt } from '../../../app/actions';
import { getRuntime } from '../../../app/runtime';
import { Button } from '../../../shared/ui/Button';
import { Field, Input, Select } from '../../../shared/ui/Form';
import { Skeleton } from '../../../shared/ui/Misc';

export function ServerDiscovery({ guildId }: { guildId: string }) {
  const { t: msg, locale } = useI18n();
  const qc = useQueryClient();
  const key = ['guild', guildId, 'discovery'];
  const settings = useQuery({ queryKey: key, queryFn: () => getRuntime().api.guildDiscovery(guildId) });
  const categories = useQuery({ queryKey: ['discovery', 'categories'], queryFn: () => getRuntime().api.discoveryCategories(), staleTime: 300_000 });
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const data = settings.data;
  useEffect(() => {
    if (!data) return;
    setCategory(data.category ?? '');
    setTags(data.tags.join(', '));
  }, [data]);

  const save = async (enabled: boolean) => {
    setSaving(true);
    const updated = await attempt(() => getRuntime().api.putGuildDiscovery(guildId, { enabled, category: category || null, tags: parseTags(tags) }), enabled ? msg("settings.serverdiscovery.could.not.list.this.server") : msg("settings.serverdiscovery.could.not.remove.the.listing"));
    setSaving(false);
    if (updated) {
      qc.setQueryData(key, updated);
      void qc.invalidateQueries({ queryKey: ['discovery', 'guilds'] });
    }
  };

  return (
    <div className="settings-page">
      <h1>{msg("settings.serverdiscovery.server.discovery")}</h1>
      <p className="page-sub">{msg("settings.serverdiscovery.list.this.server.in.discover.so.anyone.can.find")}</p>
      {!data ? (
        <Skeleton height={120} radius={12} />
      ) : (
        <div className="stack">
          <p className="setting-desc">
            {data.enabled ? msg("settings.serverdiscovery.this.server.is.listed.in.discover") : msg("settings.serverdiscovery.this.server.is.not.listed")} {memberCountLabel(data.member_count, locale)}.
          </p>
          {data.blockers.length > 0 && (
            <ul className="discovery-blockers" role="status">
              {data.blockers.map((b) => <li key={b}>{blockerMessage(b, locale)}</li>)}
            </ul>
          )}
          <Field label={msg("settings.serverdiscovery.category")}>
            {(id) => (
              <Select id={id} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">{msg("settings.serverdiscovery.choose.a.category")}</option>
                {categories.data?.map((c) => <option key={c} value={c}>{categoryLabel(c, locale)}</option>)}
              </Select>
            )}
          </Field>
          <Field label={msg("settings.serverdiscovery.tags")} hint={msg("settings.serverdiscovery.up.to.5.separated.by.commas.or.spaces.letters")}>
            {(id) => <Input id={id} value={tags} placeholder="rust, open-source" onChange={(e) => setTags(e.target.value)} />}
          </Field>
          <div className="discovery-actions">
            <Button variant="primary" loading={saving} disabled={!category || (data.blockers.length > 0 && !data.enabled)} onClick={() => void save(true)}>
              {data.enabled ? msg("settings.serverdiscovery.save.listing") : msg("settings.serverdiscovery.list.in.discover")}
            </Button>
            {data.enabled && <Button variant="ghost" loading={saving} onClick={() => void save(false)}>{msg("settings.serverdiscovery.remove.from.discover")}</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
