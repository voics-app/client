import { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { inviteWebUrl } from '@discordy/core/domain/inviteLinks';
import { getRuntime } from '../runtime';
import { theme } from '../theme';
import { Button } from '../ui/controls';
import { InviteForm } from './InviteForm';
import { inviteChannelId } from './inviteModel';

/** The result of a created invite: its link with Copy and Share. */
export function InviteLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const link = inviteWebUrl(code, getRuntime().apiUrl);
  return (
    <View style={styles.result}>
      <Text selectable style={styles.link}>
        {link}
      </Text>
      <View style={styles.actions}>
        <Button tone="primary" label={copied ? 'Copied' : 'Copy link'} onPress={() => void Clipboard.setStringAsync(link).then(() => setCopied(true))} />
        <Button label="Share" onPress={() => void Share.share({ message: link })} />
      </View>
    </View>
  );
}

/** Desktop's "Invite people" body: pick an expiry and use limit, create the link, copy or share it. */
export function InviteContent({ guildId }: { guildId: string }) {
  const channels = useGuildStore((s) => s.channels);
  const channelId = inviteChannelId(channels, guildId);
  const [code, setCode] = useState<string | null>(null);
  if (!channelId) return <Text style={styles.note}>This server has no text channel to invite through.</Text>;
  return code ? <InviteLink code={code} /> : <InviteForm channelId={channelId} onCreated={(invite) => setCode(invite.code)} />;
}

const styles = StyleSheet.create({
  note: { color: theme.muted, paddingHorizontal: 20, paddingVertical: 16 },
  result: { paddingHorizontal: 20, gap: 14, paddingBottom: 8 },
  link: { color: theme.text, fontSize: 15, backgroundColor: theme.raised, borderRadius: 10, padding: 12 },
  actions: { flexDirection: 'row', gap: 10 },
});
