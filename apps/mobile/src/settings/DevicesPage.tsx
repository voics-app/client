import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { AuthSession, Device } from '@discordy/core/contracts/rest';
import { orderSessions, sessionDetail, sessionTitle } from '@discordy/core/domain/authSessions';
import { getRuntime } from '../runtime';
import { theme } from '../theme';
import { attempt, confirmDestructive } from '../ui/attempt';
import { Button } from '../ui/controls';
import { Hint, SectionLabel, SettingRow, SettingsPage } from './rows';

const isPhone = (session: AuthSession) => session.os === 'Android' || session.os === 'iOS';

/** Desktop's Devices page: where the account is logged in with a Log out per other device (and for all of them), and the encrypted-message devices. */
export function DevicesPage({ highlight }: { highlight: string | null }) {
  const me = useSessionStore((s) => s.user?.id);
  const current = useSessionStore((s) => s.deviceId);
  const [sessions, setSessions] = useState<AuthSession[] | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await getRuntime().api.listSessions());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);
  useEffect(() => {
    if (!me) return;
    getRuntime().api.listUserDevices(me).then(setDevices).catch(() => setDevices([]));
  }, [me]);

  const ordered = orderSessions(sessions ?? []);
  const others = ordered.filter((s) => !s.current);
  const now = Date.now();

  const run = async (key: string, action: () => Promise<void>, failure: string) => {
    setBusy(key);
    await attempt(action, failure);
    await loadSessions();
    setBusy(null);
  };

  return (
    <SettingsPage highlight={highlight}>
      <SectionLabel>Logged-in devices</SectionLabel>
      {failed && <Text accessibilityRole="alert" style={{ color: theme.danger, paddingHorizontal: 16 }}>Could not load your devices.</Text>}
      {ordered.map((session) => (
        <SettingRow key={session.id} title={`${sessionTitle(session)}${session.current ? ' (this device)' : ''}`} description={sessionDetail(session, now)}>
          <Ionicons name={isPhone(session) ? 'phone-portrait-outline' : 'laptop-outline'} size={24} color={theme.muted} />
          {!session.current && <Button label="Log out" accessibilityLabel={`Log out ${sessionTitle(session)}`} busy={busy === session.id} disabled={busy !== null} onPress={() => void run(session.id, () => getRuntime().api.revokeSession(session.id), 'Could not log out that device')} />}
        </SettingRow>
      ))}
      {sessions?.length === 0 && <Hint>No active sessions.</Hint>}
      {others.length > 0 && (
        <SettingRow title="Log out all known devices" description="Every device except this one is signed out right away.">
          <Button
            label="Log out all"
            tone="danger"
            busy={busy === 'all'}
            disabled={busy !== null}
            onPress={() => confirmDestructive('Log out all known devices?', 'Every device except this one will be signed out right away and will need to log in again.', 'Log out all', () => void run('all', () => getRuntime().api.logoutOtherSessions(), 'Could not log out your other devices'))}
          />
        </SettingRow>
      )}

      <SectionLabel>Encrypted-message devices</SectionLabel>
      {devices?.map((d) => (
        <SettingRow key={d.device_id} title={d.device_id === current ? 'This device' : 'Device'} description={`${d.device_id}\n${d.identity_key_b64.slice(0, 32)}`} />
      ))}
      {devices?.length === 0 && <Hint>No devices registered.</Hint>}
    </SettingsPage>
  );
}
