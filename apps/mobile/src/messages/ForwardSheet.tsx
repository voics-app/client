import { Alert, StyleSheet, Text, View } from 'react-native';
import { useMemo, useState } from 'react';
import { errorMessage } from '@discordy/core/application/errorMessage';
import { forwardMessage, permissionsInChannel } from '@discordy/core/application/forwardCommands';
import { useClosedDmStore } from '@discordy/core/application/stores/closedDmStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import { useRelationshipStore } from '@discordy/core/application/stores/peopleStores';
import { FORWARD_REASON_PRIVATE, forwardSnapshot, forwardTargets, type ForwardTarget } from '@discordy/core/domain/forward';
import { dmTitle } from '../dms/dmModel';
import { getRuntime } from '../runtime';
import { useLastValue } from '../sheets/useLastValue';
import { theme } from '../theme';
import { Button, Field } from '../ui/controls';
import { ListRow } from '../ui/ListRow';
import { Sheet } from '../ui/Sheet';

/** Desktop's Forward picker: recent DMs and groups, then channels you can send in, with an optional comment. A private chat is shown disabled. */
export function ForwardSheet({ message: shown, onClose }: { message: ChatMessage | null; onClose(): void }) {
  const message = useLastValue(shown);
  const channels = useGuildStore((s) => s.channels);
  const guilds = useGuildStore((s) => s.guilds);
  const closed = useClosedDmStore((s) => s.closed);
  const relationships = useRelationshipStore((s) => s.byUser);
  const [query, setQuery] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const hasAttachments = (message?.attachments.length ?? 0) > 0 || (message ? (forwardSnapshot(message)?.attachments.length ?? 0) > 0 : false);
  const targets = useMemo(
    () =>
      forwardTargets({ channels, guilds, closed, query, hasAttachments, dmName: (c) => dmTitle(c, relationships), modeOf: (c) => c.delivery_mode, permissionsOf: permissionsInChannel })
        // An encrypted server channel must never receive a message through the server in the clear, so it is shown but cannot be picked.
        .map((t) => (t.kind === 'channel' && channels[t.id]?.delivery_mode !== 'standard' ? { ...t, disabledReason: FORWARD_REASON_PRIVATE } : t)),
    [channels, guilds, closed, query, hasAttachments, relationships],
  );

  const close = () => {
    setQuery('');
    setComment('');
    onClose();
  };
  const send = async (target: ForwardTarget) => {
    if (!message) return;
    setBusy(target.id);
    try {
      await forwardMessage(getRuntime().api, message, target.id, comment);
      close();
    } catch (error) {
      Alert.alert('Could not forward message', errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const preview = message ? (forwardSnapshot(message)?.content ?? message.content) : '';
  return (
    <Sheet visible={shown !== null} title="Forward to" closeLabel="Close forward" onClose={close}>
      <View style={styles.form}>
        <Field label="Search destinations" value={query} onChangeText={setQuery} placeholder="Search for people, groups or channels" />
        {preview ? (
          <Text numberOfLines={3} style={styles.preview}>
            {preview}
          </Text>
        ) : null}
        <Field label="Optional message" value={comment} onChangeText={setComment} maxLength={2000} placeholder="Add an optional message" autoCapitalize="sentences" />
      </View>
      {targets.length === 0 && <Text style={styles.empty}>Nothing matches.</Text>}
      {targets.map((t) => (
        <ListRow
          key={t.id}
          title={t.label}
          {...((t.disabledReason ?? t.context) ? { subtitle: t.disabledReason ?? t.context! } : {})}
          right={<Button label="Send" accessibilityLabel={`Send to ${t.label}`} disabled={Boolean(t.disabledReason) || busy !== null} busy={busy === t.id} onPress={() => void send(t)} />}
        />
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { paddingHorizontal: 20 },
  preview: { color: theme.muted, fontSize: 14, borderLeftWidth: 3, borderLeftColor: theme.hairlineStrong, paddingLeft: 10, marginBottom: 12 },
  empty: { color: theme.muted, textAlign: 'center', padding: 16 },
});
