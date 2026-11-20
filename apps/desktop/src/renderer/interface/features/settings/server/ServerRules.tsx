import { useEffect, useState } from 'react';
import { getRuntime } from '../../../app/runtime';
import { errorMessage } from '../../../app/actions';
import { Button } from '../../../shared/ui/Button';
import { Field, TextArea } from '../../../shared/ui/Form';

export function ServerRules({ guildId }: { guildId: string }) {
  const [rules, setRules] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    getRuntime().api.memberVerification(guildId).then((data) => {
      if (!active) return;
      setRules(data.rules.join('\n'));
      setEnabled(data.enabled);
      setReady(true);
    }).catch((error: unknown) => { if (active) setMessage(errorMessage(error)); });
    return () => { active = false; };
  }, [guildId]);
  const save = async () => {
    setBusy(true);
    setMessage('');
    try {
      await getRuntime().api.setMemberVerification(guildId, { enabled, rules: rules.split('\n').map((rule) => rule.trim()).filter(Boolean) });
      setMessage('Rules saved. New members must accept the current version before sending messages.');
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  };
  return <div className="settings-page"><h1>Rules screening</h1>
    <p className="page-sub">Ask new members to accept your rules before they send messages.</p>
    <label><input type="checkbox" checked={enabled} disabled={!ready} onChange={(event) => setEnabled(event.target.checked)} /> Require rule acceptance</label>
    <Field label="Rules, one per line">{(id) => <TextArea id={id} value={rules} disabled={!ready} onChange={(event) => setRules(event.target.value)} rows={8} />}</Field>
    <Button variant="primary" disabled={!ready} loading={busy} onClick={() => void save()}>Save rules</Button>
    {message && <p role="status">{message}</p>}
  </div>;
}
