import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import { THREAD_NAME_MAX, threadNameFor } from '@discordy/core/domain/threads';
import { getRuntime } from '../runtime';
import { useLastValue } from '../sheets/useLastValue';
import { attempt } from '../ui/attempt';
import { Button, Field } from '../ui/controls';
import { Sheet } from '../ui/Sheet';

/** Names and creates a thread from a message (Create Thread in the message menu), then opens it. */
export function NewThreadSheet({ message: shown, onClose }: { message: ChatMessage | null; onClose(): void }) {
  const message = useLastValue(shown);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (shown) setName(threadNameFor(shown.content ?? ''));
  }, [shown]);

  const create = async () => {
    if (!message || name.trim() === '') return;
    setBusy(true);
    const thread = await attempt(() => getRuntime().api.createThread(message.channel_id, { name: name.trim(), message_id: message.id }), 'Could not create the thread');
    setBusy(false);
    if (!thread) return;
    const guildId = thread.guild_id ?? message.guild_id ?? undefined;
    useGuildStore.getState().upsertChannel({ ...thread, ...(guildId ? { guild_id: guildId } : {}) });
    onClose();
    if (guildId) router.push(`/servers/${guildId}/${thread.id}`);
  };

  return (
    <Sheet visible={shown !== null} title="New thread" closeLabel="Close create thread" onClose={onClose}>
      <View style={styles.body}>
        <Field label="Thread name" value={name} onChangeText={setName} maxLength={THREAD_NAME_MAX} autoFocus returnKeyType="done" onSubmitEditing={() => void create()} />
        <Button label="Create thread" tone="primary" busy={busy} disabled={name.trim() === ''} onPress={() => void create()} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 8 },
});
