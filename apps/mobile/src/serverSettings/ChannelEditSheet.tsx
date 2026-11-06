import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { ChannelType, type Channel } from '@discordy/core/contracts/rest';
import { getRuntime } from '../runtime';
import { attempt } from '../ui/attempt';
import { Button, Field } from '../ui/controls';
import { Sheet, SheetConfirm, SheetOption } from '../ui/Sheet';
import { normalizeChannelName } from './channelAdminModel';

/** Rename and delete for one channel, in a sheet; deleting asks first. Mount it with the channel's id as `key` so each channel starts fresh. */
export function ChannelEditSheet({ channel, onClose }: { channel: Channel | null; onClose(): void }) {
  const [name, setName] = useState(channel?.name ?? '');
  const [step, setStep] = useState<'edit' | 'delete'>('edit');
  const [busy, setBusy] = useState(false);
  const isCategory = channel?.type === ChannelType.GUILD_CATEGORY;
  const clean = normalizeChannelName(name, isCategory);

  const rename = async () => {
    if (!channel) return;
    setBusy(true);
    const updated = await attempt(() => getRuntime().api.updateChannel(channel.id, { name: clean }), 'Could not rename channel');
    setBusy(false);
    if (updated) {
      useGuildStore.getState().upsertChannel({ ...channel, ...updated, guild_id: channel.guild_id });
      onClose();
    }
  };

  const remove = async () => {
    if (!channel) return;
    onClose();
    const done = await attempt(async () => {
      await getRuntime().api.deleteChannel(channel.id);
      return true;
    }, 'Could not delete channel');
    if (done) useGuildStore.getState().removeChannel(channel.id);
  };

  const label = channel ? (isCategory ? (channel.name ?? '') : `#${channel.name}`) : '';
  return (
    <Sheet visible={channel !== null} title={step === 'delete' ? `Delete ${label}?` : label} closeLabel="Close channel settings" onClose={onClose}>
      {step === 'delete' ? (
        <SheetConfirm
          body={isCategory ? 'The category is removed. Its channels stay in the server.' : 'Messages in this channel will be lost for everyone.'}
          confirmLabel={isCategory ? 'Delete category' : 'Delete channel'}
          onConfirm={() => void remove()}
          onCancel={() => setStep('edit')}
        />
      ) : (
        <View style={styles.form}>
          <Field label={isCategory ? 'Category name' : 'Channel name'} value={name} maxLength={100} onChangeText={setName} />
          <Button tone="primary" label="Save name" busy={busy} disabled={clean === '' || clean === channel?.name} onPress={() => void rename()} />
          <SheetOption label={isCategory ? 'Delete category' : 'Delete channel'} danger onPress={() => setStep('delete')} />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { paddingHorizontal: 20, paddingBottom: 8 },
});
