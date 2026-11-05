import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { groupSecret, looksLikeSecondFactor } from '@discordy/core/domain/accountSecurity';
import type { BackupCode, TotpEnrollment } from '@discordy/core/contracts/rest';
import { getRuntime } from '../../runtime';
import { theme } from '../../theme';
import { Button, Field } from '../../ui/controls';
import { Sheet } from '../../ui/Sheet';
import { useAction } from './useAction';

const refreshMe = () =>
  getRuntime()
    .api.me()
    .then((me) => useSessionStore.getState().setUser(me))
    .catch(() => undefined);

export function BackupCodesView({ codes }: { codes: BackupCode[] }) {
  const plain = codes.flatMap((c) => (c.code ? [c.code] : []));
  const [copied, setCopied] = useState(false);
  return (
    <View>
      <View style={styles.codes}>
        {codes.map((c, i) => (
          <Text key={c.code ?? i} selectable style={[styles.code, c.consumed && styles.used]}>
            {c.code ?? (c.consumed ? 'used' : 'unused')}
          </Text>
        ))}
      </View>
      {plain.length > 0 && <Button label={copied ? 'Copied' : 'Copy codes'} onPress={() => void Clipboard.setStringAsync(plain.join('\n')).then(() => setCopied(true))} />}
    </View>
  );
}

function ErrorLine({ text }: { text: string | null }) {
  return text ? (
    <Text accessibilityRole="alert" style={styles.error}>
      {text}
    </Text>
  ) : null;
}

const NO_AUTHENTICATOR_APP = 'No authenticator app opened. Enter the key by hand in the app you use.';

function EnableBody({ onClose }: { onClose(): void }) {
  const [password, setPassword] = useState('');
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<BackupCode[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const api = getRuntime().api;
  const finish = () => {
    void refreshMe();
    onClose();
  };

  if (codes) {
    return (
      <View style={styles.body}>
        <Text style={styles.text}>Each code works once if you lose your authenticator. They are not shown again.</Text>
        <BackupCodesView codes={codes} />
        <View style={styles.gap} />
        <Button label="I saved them" tone="primary" onPress={finish} />
      </View>
    );
  }
  if (enrollment) {
    // Desktop shows a QR code; on a phone the authenticator app is opened with the otpauth link instead, or the key is typed in by hand.
    const openAuthenticator = () => Linking.openURL(enrollment.otpauth_uri).catch(() => setNote(NO_AUTHENTICATOR_APP));
    return (
      <View style={styles.body}>
        <Text style={styles.text}>Add this account to an authenticator app, then enter the 6-digit code it shows.</Text>
        <Button label="Open authenticator app" onPress={() => void openAuthenticator()} />
        <Text style={styles.text}>Or enter this key by hand:</Text>
        <Text selectable accessibilityLabel="Authenticator key" style={styles.secret}>
          {groupSecret(enrollment.secret)}
        </Text>
        {note && <Text style={styles.text}>{note}</Text>}
        <Field label="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" />
        <ErrorLine text={error} />
        <Button label="Turn on" tone="primary" busy={busy} disabled={code.trim().length !== 6} onPress={() => void run(async () => setCodes(await api.verifyTotp(code.trim())), 'code')} />
      </View>
    );
  }
  return (
    <View style={styles.body}>
      <Text style={styles.text}>Confirm your password to start.</Text>
      <Field label="Current password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" autoFocus />
      <ErrorLine text={error} />
      <Button label="Continue" tone="primary" busy={busy} disabled={!password} onPress={() => void run(async () => setEnrollment(await api.enableTotp(password)))} />
    </View>
  );
}

function DisableBody({ onClose }: { onClose(): void }) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const { busy, error, run } = useAction();
  return (
    <View style={styles.body}>
      <Field label="Current password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" autoFocus />
      <Field label="Authenticator or backup code" value={code} onChangeText={setCode} autoComplete="one-time-code" />
      <ErrorLine text={error} />
      <Button
        label="Turn off"
        tone="danger"
        busy={busy}
        disabled={!password || !looksLikeSecondFactor(code)}
        onPress={() =>
          void run(async () => {
            const api = getRuntime().api;
            await api.disableTotp(password, code.trim());
            useSessionStore.getState().setUser(await api.me());
            onClose();
          })
        }
      />
    </View>
  );
}

function CodesBody() {
  const [password, setPassword] = useState('');
  const [codes, setCodes] = useState<BackupCode[] | null>(null);
  const { busy, error, run } = useAction();
  const load = (regenerate: boolean) => void run(async () => setCodes(await getRuntime().api.backupCodes(password, regenerate)));
  return (
    <View style={styles.body}>
      <Text style={styles.text}>Codes are stored hashed, so only their used state can be shown. Regenerate to get a fresh set.</Text>
      {codes ? (
        <>
          <BackupCodesView codes={codes} />
          <View style={styles.gap} />
          <ErrorLine text={error} />
          <Button label="Regenerate" busy={busy} onPress={() => load(true)} />
        </>
      ) : (
        <>
          <Field label="Current password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" autoFocus />
          <ErrorLine text={error} />
          <Button label="Show status" tone="primary" busy={busy} disabled={!password} onPress={() => load(false)} />
        </>
      )}
    </View>
  );
}

export type TotpDialog = 'enable' | 'disable' | 'codes';

const TITLE: Record<TotpDialog, string> = { enable: 'Set up two-factor authentication', disable: 'Turn off two-factor authentication', codes: 'Backup codes' };

/** Two-factor setup, removal and backup codes with the same steps as desktop: password first, then the authenticator code. */
export function TotpSheet({ dialog, onClose }: { dialog: TotpDialog | null; onClose(): void }) {
  return (
    <Sheet visible={dialog !== null} title={TITLE[dialog ?? 'enable']} closeLabel="Close" onClose={onClose}>
      {dialog === 'enable' && <EnableBody onClose={onClose} />}
      {dialog === 'disable' && <DisableBody onClose={onClose} />}
      {dialog === 'codes' && <CodesBody />}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 8 },
  text: { color: theme.muted, fontSize: 14, marginBottom: 12 },
  error: { color: theme.danger, fontSize: 14, marginBottom: 12 },
  secret: { color: theme.text, fontSize: 18, letterSpacing: 1, fontVariant: ['tabular-nums'], marginBottom: 16 },
  codes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  code: { color: theme.text, fontSize: 15, minWidth: '45%', fontVariant: ['tabular-nums'] },
  used: { color: theme.subtle, textDecorationLine: 'line-through' },
  gap: { height: 12 },
});
