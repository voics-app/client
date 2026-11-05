import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '@discordy/core/application/errorMessage';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import type { Invite } from '@discordy/core/contracts/rest';
import { BRAND } from '../brand';
import { getRuntime } from '../runtime';
import { ServerIcon } from '../shell/ServerIcon';
import { theme } from '../theme';
import { attempt } from '../ui/attempt';
import { Button, Field } from '../ui/controls';
import { Sheet } from '../ui/Sheet';
import { inviteCodeOf, invitePreview } from './joinModel';

/** Desktop's Join a server dialog: paste an invite link or code, look at the server, then accept. A server you are already in just opens. */
export function JoinServerSheet({ visible, onClose, initialCode }: { visible: boolean; onClose(): void; initialCode?: string }) {
  const [text, setText] = useState('');
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const code = inviteCodeOf(text);

  const close = () => {
    setText('');
    setInvite(null);
    setError(null);
    onClose();
  };
  const open = (guildId: string) => useUiStore.getState().navigate({ kind: 'guild', guildId, channelId: null });

  const lookup = async (given: string | null = code) => {
    if (!given) return;
    setBusy(true);
    setError(null);
    try {
      const found = await getRuntime().api.invite(given);
      const guildId = found.guild?.id;
      if (guildId && useGuildStore.getState().guilds[guildId]) {
        close();
        open(guildId);
        return;
      }
      setInvite(found);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    if (!invite) return;
    setBusy(true);
    const joined = await attempt(() => getRuntime().api.acceptInvite(invite.code), 'Could not join the server');
    setBusy(false);
    if (!joined) return;
    const guildId = joined.guild?.id ?? invite.guild?.id;
    close();
    // The server arrives over the gateway a moment after the invite is accepted.
    if (guildId) setTimeout(() => open(guildId), 300);
  };

  useEffect(() => {
    // A tapped invite link arrives with its code: show the server at once.
    if (visible && initialCode) {
      setText(initialCode);
      void lookup(initialCode);
    }
    // Only a new link or opening the sheet starts a lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialCode]);

  const preview = invite ? invitePreview(invite) : null;
  return (
    <Sheet visible={visible} title="Join a server" closeLabel="Close join a server" onClose={close}>
      <View style={styles.body}>
        {preview && invite ? (
          <>
            <View style={styles.card}>
              <View style={styles.icon}>
                <ServerIcon guild={{ id: invite.guild?.id ?? '', name: preview.name, icon: invite.guild?.icon ?? null }} />
              </View>
              <View style={styles.copy}>
                <Text numberOfLines={1} style={styles.name}>
                  {preview.name}
                </Text>
                <Text style={styles.people}>{preview.people}</Text>
              </View>
            </View>
            <Button label="Accept invite" tone="primary" busy={busy} onPress={() => void accept()} />
            <Button label="Back" onPress={() => setInvite(null)} />
          </>
        ) : (
          <>
            <Text style={styles.hint}>Enter an invite link or code.</Text>
            <Field label="Invite link or code" value={text} onChangeText={setText} placeholder={`${BRAND.landingUrl}/invite/hTKzmak`} returnKeyType="go" onSubmitEditing={() => void lookup()} autoFocus keyboardType="url" />
            {error && (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            )}
            <Button label="Continue" tone="primary" busy={busy} disabled={!code} onPress={() => void lookup()} />
          </>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 8, gap: 8 },
  hint: { color: theme.muted, fontSize: 15, marginBottom: 8 },
  error: { color: theme.danger, fontSize: 14 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: 12, backgroundColor: theme.raised, marginBottom: 8 },
  icon: { width: 56, height: 56, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.raisedHover },
  copy: { flex: 1 },
  name: { color: theme.text, fontSize: 18, fontWeight: '700' },
  people: { color: theme.muted, fontSize: 14, marginTop: 2 },
});
