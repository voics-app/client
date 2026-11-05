import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { Avatar } from '../profile/Avatar';
import { getRuntime } from '../runtime';
import { theme } from '../theme';
import { Button } from '../ui/controls';
import { CredentialSheet } from './account/CredentialSheet';
import type { CredentialKind } from './account/accountModel';
import { LeaveAccountSheet, type LeaveMode } from './account/LeaveAccountSheet';
import { TotpSheet, type TotpDialog } from './account/TotpSheets';
import { VerifyEmailBanner } from './account/VerifyEmailBanner';
import { confirmLogout } from './logout';
import { SettingRow, SettingsPage } from './rows';

/** Desktop's My account: identity, credentials, two-factor, disable and delete, and Log out. Every change asks for the password, as on desktop. */
export function AccountPage({ highlight }: { highlight: string | null }) {
  const user = useSessionStore((s) => s.user);
  const [credential, setCredential] = useState<CredentialKind | null>(null);
  const [totp, setTotp] = useState<TotpDialog | null>(null);
  const [leave, setLeave] = useState<LeaveMode | null>(null);
  const idle = credential === null && totp === null && leave === null;
  useEffect(() => {
    // Refreshed on open and whenever a sheet closes, so a verified email or a toggled second factor shows correctly.
    if (idle) void getRuntime().api.me().then((me) => useSessionStore.getState().setUser(me)).catch(() => undefined);
  }, [idle]);
  if (!user) return null;
  const mfa = Boolean(user.mfa_enabled);
  return (
    <SettingsPage highlight={highlight}>
      <View style={styles.card}>
        <Avatar user={user} size={72} />
        <View style={styles.names}>
          <Text style={styles.name}>{user.global_name || user.username}</Text>
          <Text style={styles.handle}>{user.username}</Text>
          {user.email && <Text style={styles.handle}>{user.email}</Text>}
        </View>
        <Button label="Edit profile" onPress={() => router.push('/settings/profile')} />
      </View>
      <VerifyEmailBanner user={user} />
      <SettingRow title="Username" description={user.username}>
        <Button label="Edit" onPress={() => setCredential('username')} />
      </SettingRow>
      <SettingRow title="Email" description={user.email ?? 'No email on this account'}>
        <Button label="Edit" onPress={() => setCredential('email')} />
      </SettingRow>
      <SettingRow title="Password" description="Changing it signs your other sessions out.">
        <Button label="Change" onPress={() => setCredential('password')} />
      </SettingRow>
      <SettingRow title="Two-factor authentication" description={mfa ? 'On. Sign-in asks for a code from your authenticator app.' : 'Add a second step to sign-in with an authenticator app.'}>
        {mfa ? (
          <View style={styles.pair}>
            <Button label="Backup codes" onPress={() => setTotp('codes')} />
            <Button label="Turn off" tone="danger" onPress={() => setTotp('disable')} />
          </View>
        ) : (
          <Button label="Turn on" tone="primary" onPress={() => setTotp('enable')} />
        )}
      </SettingRow>
      <SettingRow title="Disable account" description="Sign out everywhere and hide your account until you sign in again.">
        <Button label="Disable" tone="danger" onPress={() => setLeave('disable')} />
      </SettingRow>
      <SettingRow title="Delete account" description="Schedules deletion after 14 days.">
        <Button label="Delete" tone="danger" onPress={() => setLeave('delete')} />
      </SettingRow>
      <SettingRow title="Log out" description="Removes your session from this device.">
        <Button label="Log out" tone="danger" onPress={confirmLogout} />
      </SettingRow>
      <CredentialSheet kind={credential} user={user} onClose={() => setCredential(null)} />
      <TotpSheet dialog={totp} onClose={() => setTotp(null)} />
      <LeaveAccountSheet mode={leave} user={user} onClose={() => setLeave(null)} />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: 12, padding: 20 },
  names: { alignItems: 'center' },
  name: { color: theme.text, fontSize: 22, fontWeight: '700' },
  handle: { color: theme.muted, marginTop: 2 },
  pair: { flexDirection: 'row', gap: 8 },
});
