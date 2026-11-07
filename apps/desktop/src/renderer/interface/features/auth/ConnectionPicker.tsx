import { useState } from 'react';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { ConnectionProfile, ConnectionProfileId } from '@shared/ipc';
import { bridge } from '../../app/bridge';
import { errorMessage } from '../../app/actions';
import { Button } from '../../shared/ui/Button';
import { Field, Input, Segmented } from '../../shared/ui/Form';
import { Modal } from '../../shared/ui/Modal';
import { BRAND } from '@shared/brand';

const PRESETS: Record<'production' | 'local', ConnectionProfile> = {
  production: { id: 'production', apiUrl: BRAND.apiUrl, gatewayUrl: BRAND.gatewayUrl, cdnUrl: BRAND.cdnUrl },
  local: { id: 'local', apiUrl: 'http://127.0.0.1:18000', gatewayUrl: 'ws://127.0.0.1:18000', cdnUrl: 'http://127.0.0.1:18000/cdn' },
};

const CUSTOM_EXAMPLE: ConnectionProfile = {
  id: 'custom',
  apiUrl: `https://custom-api.${BRAND.baseDomain}`,
  gatewayUrl: `wss://custom-gateway.${BRAND.baseDomain}`,
  cdnUrl: `https://custom-cdn.${BRAND.baseDomain}`,
};

/** Switches the API, gateway and CDN endpoints. The app reloads to rebuild clients against the new profile. */
export function ConnectionPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const current = useSessionStore((s) => s.appInfo?.connection);
  const [id, setId] = useState<ConnectionProfileId>(current?.id ?? 'production');
  const [custom, setCustom] = useState<ConnectionProfile>(current?.id === 'custom' ? current : CUSTOM_EXAMPLE);
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
    <Modal open={open} onClose={onClose} title="Connection" description={`Choose which ${BRAND.displayName} servers this app talks to.`} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void apply()}>Apply and reload</Button></>}>
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
