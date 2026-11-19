import { useState } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import type { ForumTag } from '@discordy/core/contracts/rest';
import { attempt } from '../../../app/actions';
import { getRuntime } from '../../../app/runtime';
import { Button } from '../../../shared/ui/Button';
import { Field, Input, Switch } from '../../../shared/ui/Form';

export function ForumSettings({ channelId }: { channelId: string }) {
  const channel = useGuildStore((s) => s.channels[channelId]);
  const [tags, setTags] = useState<ForumTag[]>(channel?.available_tags ?? []);
  const [name, setName] = useState('');
  const [required, setRequired] = useState(channel?.require_tags ?? false);
  const [sort, setSort] = useState(String(channel?.default_sort_order ?? 0));
  const [layout, setLayout] = useState(String(channel?.default_forum_layout ?? 0));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const updated = await attempt(() => getRuntime().api.updateChannel(channelId, { available_tags: tags, require_tags: required, default_sort_order: Number(sort), default_forum_layout: Number(layout) }), 'Could not save forum settings');
    if (updated) { useGuildStore.getState().upsertChannel(updated); setTags(updated.available_tags ?? []); }
    setSaving(false);
  };
  return <section aria-label="Forum settings">
    <h2>Forum settings</h2>
    <p className="setting-desc">Use the channel topic above for post guidelines.</p>
    <Field label="Add tag">{(id) => <Input id={id} value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />}</Field>
    <Button disabled={!name.trim() || tags.length >= 20} onClick={() => { setTags([...tags, { id: '', name: name.trim(), moderated: false }]); setName(''); }}>Add tag</Button>
    <ul>{tags.map((tag, index) => <li key={`${tag.id}-${index}`}><input aria-label={`Tag ${index + 1} name`} value={tag.name} maxLength={20} onChange={(e) => setTags(tags.map((t, i) => i === index ? { ...t, name: e.target.value } : t))} /> <label><input type="checkbox" checked={tag.moderated ?? false} onChange={(e) => setTags(tags.map((t, i) => i === index ? { ...t, moderated: e.target.checked } : t))} /> Moderators only</label> <Button onClick={() => setTags(tags.filter((_, i) => i !== index))}>Remove</Button></li>)}</ul>
    <div className="perm-row"><p className="setting-title">Require a tag</p><Switch label="Require a tag" checked={required} onChange={setRequired} /></div>
    <label>Default sort <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="0">Recent activity</option><option value="1">Creation date</option></select></label>
    <label>Default layout <select value={layout} onChange={(e) => setLayout(e.target.value)}><option value="0">Automatic</option><option value="1">List</option><option value="2">Gallery</option></select></label>
    <Button variant="primary" disabled={saving || (required && tags.length === 0) || tags.some((tag) => !tag.name.trim())} onClick={() => void save()}>Save forum settings</Button>
  </section>;
}
