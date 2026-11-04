import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { ChannelType, type Channel } from '@discordy/core/contracts/rest';
import { getRuntime } from '../runtime';
import { attempt } from '../ui/attempt';
import { Button, Choices, Field } from '../ui/controls';
import { Sheet } from '../ui/Sheet';
import { CHANNEL_TYPE_OPTIONS, DELIVERY_OPTIONS, createChannelBody, type DeliveryChoice } from './channelAdminModel';

interface Props {
  guildId: string;
  /** Create a category instead of a channel. */
  category: boolean;
  /** Categories of the server, to pick the parent from. */
  categories: Channel[];
  visible: boolean;
  onClose(): void;
}

/** The create dialog of the desktop: name, kind, category and (for text) delivery mode. */
export function NewChannelSheet({ guildId, category, categories, visible, onClose }: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState<number>(ChannelType.GUILD_TEXT);
  const [parentId, setParentId] = useState<string>('');
  const [delivery, setDelivery] = useState<DeliveryChoice>('standard');
  const [busy, setBusy] = useState(false);
  const kind = category ? ChannelType.GUILD_CATEGORY : type;

  const create = async () => {
    setBusy(true);
    const channel = await attempt(() => getRuntime().api.createChannel(guildId, createChannelBody({ name, type: kind, parentId: parentId || null, delivery })), 'Could not create channel');
    setBusy(false);
    if (!channel) return;
    useGuildStore.getState().upsertChannel({ ...channel, guild_id: guildId });
    setName('');
    onClose();
  };

  return (
    <Sheet visible={visible} title={category ? 'Create category' : 'Create channel'} closeLabel="Close create channel" onClose={onClose}>
      <View style={styles.form}>
        {!category && <Choices<number> label="Channel type" options={CHANNEL_TYPE_OPTIONS} value={type} onChange={setType} />}
        <Field label={category ? 'Category name' : 'Channel name'} value={name} maxLength={100} placeholder={category ? 'New category' : 'new-channel'} onChangeText={setName} />
        {!category && categories.length > 0 && <Choices<string> label="Category" options={[{ value: '', label: 'None' }, ...categories.map((c) => ({ value: c.id, label: c.name ?? 'Category' }))]} value={parentId} onChange={setParentId} />}
        {!category && type === ChannelType.GUILD_TEXT && <Choices<DeliveryChoice> label="Delivery mode" options={DELIVERY_OPTIONS} value={delivery} onChange={setDelivery} />}
        <Button tone="primary" label="Create" busy={busy} disabled={name.trim().length < 1} onPress={() => void create()} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({ form: { paddingHorizontal: 20, paddingBottom: 8 } });
