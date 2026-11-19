import { useCallback, useEffect, useState } from 'react';
import { Linking, Text } from 'react-native';
import type { LinkedConnection } from '@discordy/core/contracts/rest';
import { getRuntime } from '../runtime';
import { theme } from '../theme';
import { Button } from '../ui/controls';
import { Hint, SectionLabel, SettingRow, SettingsPage, SwitchRow } from './rows';

export function ConnectionsPage({ highlight }: { highlight: string | null }) {
  const [accounts, setAccounts] = useState<LinkedConnection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setAccounts(await getRuntime().api.connections()); setError(null); }
    catch { setError('Could not load connections.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await action(); await load(); } catch { setError('Could not update the connection. Try again.'); } finally { setBusy(false); }
  };
  const github = accounts?.find((a) => a.provider === 'github');
  return <SettingsPage highlight={highlight}>
    <SectionLabel>GitHub</SectionLabel>
    <Hint>Linked accounts are private until you choose to show them on your profile.</Hint>
    {error && <Text accessibilityRole="alert" style={{ color: theme.danger, paddingHorizontal: 16 }}>{error}</Text>}
    {accounts === null ? <SettingRow title="Connections"><Button label="Refresh" onPress={() => void load()} /></SettingRow> : github ? <>
      <SettingRow title="GitHub" description={`Linked as ${github.name}`}><Button label="Disconnect" disabled={busy} onPress={() => void run(() => getRuntime().api.deleteConnection('github'))} /></SettingRow>
      <Hint>Disconnect removes the profile link. Revoke access separately in GitHub settings.</Hint>
      <SwitchRow title="Show on profile" value={github.visible} disabled={busy} onChange={(value) => void run(() => getRuntime().api.setConnectionVisibility('github', value))} />
    </> : <>
      <SettingRow title="GitHub" description="Authorize in your browser, then return and refresh."><Button label="Connect" disabled={busy} onPress={() => void run(async () => { const { url } = await getRuntime().api.authorizeGithubConnection(); if (!/^https:\/\/github\.com\/login\/oauth\/authorize(?:\?|$)/.test(url)) throw new Error('Unexpected authorization address'); await Linking.openURL(url); })} /></SettingRow>
      <SettingRow title="Already authorized?"><Button label="Refresh" disabled={busy} onPress={() => void load()} /></SettingRow>
    </>}
  </SettingsPage>;
}
