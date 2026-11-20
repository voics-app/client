import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { Permission } from '@discordy/core/contracts/permissions';
import { ChannelType } from '@discordy/core/contracts/rest';
import type { GuildScheduledEvent } from '@discordy/core/contracts/scheduledEvents';
import { assetCandidates } from '@discordy/core/domain/assets';
import { errorMessage } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { useConnectionStore } from '../../app/connectionStore';
import { can, useGuildPermissions } from '../../shared/hooks/usePermissions';
import { Button } from '../../shared/ui/Button';
import { Field, Input, Select, TextArea } from '../../shared/ui/Form';
import { Modal } from '../../shared/ui/Modal';
import { AssetImage } from '../../shared/ui/AssetImage';
import './guildEvents.css';

const close = () => useUiStore.getState().openDialog(null);
const queryKey = (guildId: string) => ['guild-events', guildId] as const;

function EventRow({ event }: { event: GuildScheduledEvent }) {
  const cdn = useConnectionStore((s) => s.cdnUrl);
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const interest = useQuery({ queryKey: ['event-interest', event.guild_id, event.id], queryFn: () => getRuntime().api.guildScheduledEventInterest(event.guild_id, event.id) });
  const toggle = async () => {
    if (!interest.data) return;
    setBusy(true);
    setError(null);
    try {
      await getRuntime().api.setGuildScheduledEventInterest(event.guild_id, event.id, !interest.data.interested);
      await Promise.all([interest.refetch(), cache.invalidateQueries({ queryKey: queryKey(event.guild_id) })]);
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  return <li className="stack">
    {event.image && <AssetImage candidates={assetCandidates(cdn, 'guild-events', event.id, event.image, 512)} className="guild-event-cover" />}
    <strong>{event.name}</strong>
    <span>{new Date(event.scheduled_start_time).toLocaleString()} · {event.entity_metadata?.location ?? 'Voice channel'}</span>
    {event.description && <p className="setting-desc">{event.description}</p>}
    <div className="row-end"><span>{event.user_count} interested</span><Button size="sm" loading={busy} disabled={interest.isPending || interest.isError || (event.status !== 1 && !interest.data?.interested) || (Date.parse(event.scheduled_start_time) <= Date.now() && !interest.data?.interested)} onClick={() => void toggle()}>{interest.data?.interested ? 'Remove interest' : 'Interested'}</Button></div>
    {interest.isError && <p role="alert">Could not load your interest. <button type="button" onClick={() => void interest.refetch()}>Retry</button></p>}
    {error && <p role="alert">{error}</p>}
  </li>;
}

function CreateEvent({ guildId, onBack }: { guildId: string; onBack: () => void }) {
  const cache = useQueryClient();
  const channels = useGuildStore((s) => s.channels);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<'1' | '2' | '3'>('3');
  const [channel, setChannel] = useState('');
  const [location, setLocation] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choices = Object.values(channels).filter((c) => c.guild_id === guildId && c.type === (kind === '1' ? ChannelType.GUILD_STAGE_VOICE : ChannelType.GUILD_VOICE));
  const valid = name.trim().length > 0 && !!start && Date.parse(start) > Date.now() && (!end || Date.parse(end) > Date.parse(start)) && (kind === '3' ? !!end && !!location.trim() : choices.some((c) => c.id === channel));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await getRuntime().api.createGuildScheduledEvent(guildId, { name: name.trim(), description: description.trim() || null, entity_type: Number(kind) as 1 | 2 | 3, channel_id: kind === '3' ? null : channel, entity_metadata: kind === '3' ? { location: location.trim() } : null, scheduled_start_time: new Date(start).toISOString(), scheduled_end_time: end ? new Date(end).toISOString() : null, image });
      await cache.invalidateQueries({ queryKey: queryKey(guildId) });
      onBack();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  return <form className="stack" onSubmit={(e) => void submit(e)}>
    <Field label="Event name">{(id) => <Input id={id} data-autofocus required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
    <Field label="Description">{(id) => <TextArea id={id} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
    <Field label="Where">{(id) => <Select id={id} value={kind} onChange={(e) => { setKind(e.target.value as '1' | '2' | '3'); setChannel(''); }}><option value="3">External location</option><option value="2">Voice channel</option><option value="1">Stage channel</option></Select>}</Field>
    {kind === '3' ? <Field label="Location">{(id) => <Input id={id} maxLength={100} value={location} onChange={(e) => setLocation(e.target.value)} />}</Field> : <Field label="Channel">{(id) => <Select id={id} value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">Choose a channel</option>{choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>}
    <Field label="Starts">{(id) => <Input id={id} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
    <Field label={kind === '3' ? 'Ends' : 'Ends (optional)'}>{(id) => <Input id={id} type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
    <Field label="Cover image (optional)">{(id) => <input id={id} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (!file) { setImage(null); return; } const reader = new FileReader(); reader.onload = () => setImage(typeof reader.result === 'string' ? reader.result : null); reader.readAsDataURL(file); }} />}</Field>
    {error && <p role="alert">{error}</p>}
    <div className="row-end"><Button variant="ghost" onClick={onBack}>Back</Button><Button type="submit" variant="primary" disabled={!valid} loading={busy}>Create event</Button></div>
  </form>;
}

export function GuildEventsDialog({ guildId }: { guildId: string }) {
  const [creating, setCreating] = useState(false);
  const permissions = useGuildPermissions(guildId);
  const events = useQuery({ queryKey: queryKey(guildId), queryFn: () => getRuntime().api.guildScheduledEvents(guildId) });
  const mayCreate = can(permissions, Permission.CREATE_EVENTS) || can(permissions, Permission.MANAGE_EVENTS);
  return <Modal open onClose={close} title={creating ? 'Create event' : 'Server events'} width={520}>
    {creating ? <CreateEvent guildId={guildId} onBack={() => setCreating(false)} /> : <div className="stack">
      {events.isPending && <p role="status">Loading events…</p>}
      {events.isError && <p role="alert">Could not load events. <button type="button" onClick={() => void events.refetch()}>Retry</button></p>}
      {events.data?.length === 0 && <p>No events scheduled yet.</p>}
      {events.data && events.data.length > 0 && <ul className="stack">{events.data.map((event) => <EventRow key={event.id} event={event} />)}</ul>}
      <div className="row-end">{mayCreate && <Button variant="primary" onClick={() => setCreating(true)}>Create event</Button>}<Button variant="ghost" onClick={close}>Done</Button></div>
    </div>}
  </Modal>;
}
