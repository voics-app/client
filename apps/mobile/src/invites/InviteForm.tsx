import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Invite } from '@discordy/core/contracts/rest';
import { getRuntime } from '../runtime';
import { attempt } from '../ui/attempt';
import { Button, Choices } from '../ui/controls';
import { DEFAULT_EXPIRY, DEFAULT_MAX_USES, EXPIRY_OPTIONS, MAX_USES_OPTIONS } from './inviteModel';

/** Expiry and use-limit choices and a button that creates an invite through `channelId`. */
export function InviteForm({ channelId, onCreated }: { channelId: string; onCreated(invite: Invite): void }) {
  const [maxAge, setMaxAge] = useState<number>(DEFAULT_EXPIRY);
  const [maxUses, setMaxUses] = useState<number>(DEFAULT_MAX_USES);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    const invite = await attempt(() => getRuntime().api.createInvite(channelId, { max_age: maxAge, max_uses: maxUses }), 'Could not create invite');
    setBusy(false);
    if (invite) onCreated(invite);
  };

  return (
    <View style={styles.form}>
      <Choices<number> label="Expire after" options={EXPIRY_OPTIONS} value={maxAge} onChange={setMaxAge} />
      <Choices<number> label="Max uses" options={MAX_USES_OPTIONS} value={maxUses} onChange={setMaxUses} />
      <Button tone="primary" label="Generate invite link" busy={busy} onPress={() => void create()} />
    </View>
  );
}

const styles = StyleSheet.create({ form: { paddingHorizontal: 20, paddingBottom: 8 } });
