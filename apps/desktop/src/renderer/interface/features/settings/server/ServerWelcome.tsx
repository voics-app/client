import { useEffect, useState } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { ChannelType } from '@discordy/core/contracts/rest';
import { errorMessage } from '../../../app/actions';
import { getRuntime } from '../../../app/runtime';
import { Button } from '../../../shared/ui/Button';

type Entry = { channel_id: string; description: string };

export function ServerWelcome({ guildId }: { guildId: string }) {
  const channels = useGuildStore((state) => state.channels);
  const available = Object.values(channels).filter((channel) => channel.guild_id === guildId && (channel.type === ChannelType.GUILD_TEXT || channel.type === ChannelType.GUILD_ANNOUNCEMENT));
  const [enabled, setEnabled] = useState(false);
  const [description, setDescription] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    getRuntime().api.welcomeScreen(guildId).then((data) => {
      if (!active) return;
      setEnabled(data.enabled); setDescription(data.description); setEntries(data.channels); setReady(true);
    }).catch((error: unknown) => { if (active) setMessage(errorMessage(error)); });
    return () => { active = false; };
  }, [guildId]);
  const save = async () => {
    setBusy(true); setMessage('');
    try { await getRuntime().api.setWelcomeScreen(guildId, { enabled, description, channels: entries }); setMessage('Welcome screen saved.'); }
    catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  };
  return <div className="settings-page"><h1>Welcome screen</h1>
    <p className="page-sub">Introduce new members to the server and suggest channels to visit.</p>
    <div className="stack">
      <label><input type="checkbox" checked={enabled} disabled={!ready} onChange={(event) => setEnabled(event.target.checked)} /> Show to new members</label>
      <label>Introduction<textarea value={description} maxLength={300} disabled={!ready} onChange={(event) => setDescription(event.target.value)} /></label>
      {entries.map((entry, index) => <div key={index} className="stack">
        <label>Channel<select value={entry.channel_id} onChange={(event) => setEntries(entries.map((item, i) => i === index ? { ...item, channel_id: event.target.value } : item))}>
          <option value="">Choose a channel</option>{available.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
        </select></label>
        <label>Why visit?<input value={entry.description} maxLength={100} onChange={(event) => setEntries(entries.map((item, i) => i === index ? { ...item, description: event.target.value } : item))} /></label>
        <Button variant="ghost" onClick={() => setEntries(entries.filter((_, i) => i !== index))}>Remove channel</Button>
      </div>)}
      <Button variant="ghost" disabled={!ready || entries.length >= 5} onClick={() => setEntries([...entries, { channel_id: '', description: '' }])}>Add channel</Button>
      <Button variant="primary" disabled={!ready} loading={busy} onClick={() => void save()}>Save welcome screen</Button>
      {message && <p role="status">{message}</p>}
    </div>
  </div>;
}
