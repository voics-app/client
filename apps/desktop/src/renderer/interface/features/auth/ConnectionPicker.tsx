import { useState } from 'react';
import { useSessionStore } from '@renderer/application/stores/sessionStore';
import type { ConnectionProfile, ConnectionProfileId } from '@shared/ipc';
import { bridge } from '../../app/bridge';
import { errorMessage } from '../../app/actions';
import { Button } from '../../shared/ui/Button';
import { Field, Input, Segmented } from '../../shared/ui/Form';
import { Modal } from '../../shared/ui/Modal';

const PRESETS: Record<'production' | 'local', ConnectionProfile> = {
  production: { id: 'production', apiUrl: 'https://discordy-api.voics.nl', gatewayUrl: 'wss://discordy-gateway.voics.nl', cdnUrl: 'https://discordy-cdn.voics.nl' },
  local: { id: 'local', apiUrl: 'http://localhost:8000', gatewayUrl: 'ws://localhost:8000', cdnUrl: 'http://localhost:8000/cdn' },
};

/** Switches the API, gateway and CDN endpoints. The app reloads to rebuild clients against the new profile. */
export function ConnectionPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const current = useSessionStore((s) => s.appInfo?.connection);
  const [id, setId] = useState<ConnectionProfileId>(current?.id ?? 'production');
  const [custom, setCustom] = useState<ConnectionProfile>(current ?? PRESETS.production);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const profile: ConnectionProfile = id === 'custom' ? { ...custom, id: 'custom' } : PRESETS[id];

  const apply = async () => {
    if (!bridge) {
      setError('Changing the connection needs the desktop app.');
      return;
    }
    setBusy(true);
    try {
      await bridge.app.setConnection(profile);
      window.location.reload();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Connection" description="Choose which Discordy servers this app talks to." footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void apply()}>Apply and reload</Button></>}>
      <Segmented label="Profile" value={id} onChange={setId} options={[{ value: 'production', label: 'Production' }, { value: 'local', label: 'Local dev' }, { value: 'custom', label: 'Custom' }]} />
      {(['apiUrl', 'gatewayUrl', 'cdnUrl'] as const).map((key) => (
        <Field key={key} label={key === 'apiUrl' ? 'API URL' : key === 'gatewayUrl' ? 'Gateway URL' : 'CDN URL'}>
          {(fid) => <Input id={fid} value={profile[key]} readOnly={id !== 'custom'} onChange={(e) => setCustom((c) => ({ ...c, [key]: e.target.value }))} />}
        </Field>
      ))}
      {error && <p className="field-error" role="alert">{error}</p>}
    </Modal>
  );
}
