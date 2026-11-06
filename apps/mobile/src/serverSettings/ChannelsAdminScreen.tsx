import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { ChannelType, type Channel } from '@discordy/core/contracts/rest';
import { channelRowView } from '../servers/channelRowModel';
import { channelSections } from '../servers/serverModel';
import { theme } from '../theme';
import { Button, Notice } from '../ui/controls';
import { ListRow } from '../ui/ListRow';
import { canStep, moveCategoryStep, moveChannelStep } from './channelOrderActions';
import { ChannelEditSheet } from './ChannelEditSheet';
import { NewChannelSheet } from './NewChannelSheet';
import { PageGuard } from './PageGuard';

function ChannelGlyph({ channel }: { channel: Channel }) {
  const view = channelRowView(channel, 0, false);
  return view.glyph ? <Ionicons name={view.glyph} size={18} color={theme.subtle} /> : <Text style={styles.hash}>#</Text>;
}

/** Move up and down buttons for one row while reordering; a button is disabled where the step would change nothing. */
function StepButtons({ guildId, id, kind, name }: { guildId: string; id: string; kind: 'channel' | 'category'; name: string }) {
  const step = (direction: -1 | 1) => void (kind === 'channel' ? moveChannelStep(guildId, id, direction) : moveCategoryStep(guildId, id, direction));
  return (
    <View style={styles.steps}>
      {([-1, 1] as const).map((direction) => {
        const label = `Move ${name} ${direction === -1 ? 'up' : 'down'}`;
        const off = !canStep(guildId, id, kind, direction);
        return (
          <Pressable key={direction} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: off }} disabled={off} onPress={() => step(direction)} style={[styles.step, off && styles.stepOff]}>
            <Ionicons name={direction === -1 ? 'chevron-up' : 'chevron-down'} size={20} color={theme.text} />
          </Pressable>
        );
      })}
    </View>
  );
}

function Body({ guildId }: { guildId: string }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const channels = useGuildStore((s) => s.channels);
  const members = useGuildStore((s) => s.members[guildId]);
  const me = useSessionStore((s) => s.user?.id);
  const [editing, setEditing] = useState<Channel | null>(null);
  const [creating, setCreating] = useState<'channel' | 'category' | null>(null);
  const [reordering, setReordering] = useState(false);
  const sections = useMemo(() => (guild && me ? channelSections({ guild, channels, members, userId: me }) : []), [guild, channels, members, me]);
  const categories = useMemo(() => sections.flatMap((s) => (s.id ? [channels[s.id]!] : [])), [sections, channels]);
  const emptyCategories = useMemo(
    () => Object.values(channels).filter((c) => c.guild_id === guildId && c.type === ChannelType.GUILD_CATEGORY && !categories.some((k) => k.id === c.id)),
    [channels, guildId, categories],
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.buttons}>
        <Button tone="primary" label="Create channel" onPress={() => setCreating('channel')} />
        <Button label="Create category" onPress={() => setCreating('category')} />
      </View>
      <View style={styles.buttons}>
        <Button label={reordering ? 'Done reordering' : 'Reorder'} onPress={() => setReordering((r) => !r)} />
      </View>
      {sections.length === 0 && emptyCategories.length === 0 && <Notice>No channels yet.</Notice>}
      {sections.map((section) => (
        <View key={section.id ?? 'loose'}>
          {section.id && <ListRow title={section.title ?? ''} left={<Ionicons name="folder-outline" size={18} color={theme.subtle} />} right={reordering ? <StepButtons guildId={guildId} id={section.id} kind="category" name={section.title ?? 'category'} /> : undefined} {...(reordering ? {} : { onPress: () => setEditing(channels[section.id!]!), accessibilityLabel: `Edit category ${section.title}` })} />}
          {section.channels.map((channel) => (
            <ListRow key={channel.id} title={channel.name ?? ''} left={<ChannelGlyph channel={channel} />} right={reordering ? <StepButtons guildId={guildId} id={channel.id} kind="channel" name={channel.name ?? 'channel'} /> : undefined} {...(reordering ? {} : { onPress: () => router.push(`/servers/${guildId}/settings/channel/${channel.id}`), accessibilityLabel: `Edit ${channel.name}` })} />
          ))}
        </View>
      ))}
      {emptyCategories.map((c) => (
        <ListRow key={c.id} title={c.name ?? ''} left={<Ionicons name="folder-outline" size={18} color={theme.subtle} />} onPress={() => setEditing(c)} accessibilityLabel={`Edit category ${c.name}`} />
      ))}
      <ChannelEditSheet key={editing?.id ?? 'none'} channel={editing} onClose={() => setEditing(null)} />
      <NewChannelSheet guildId={guildId} category={creating === 'category'} categories={[...categories, ...emptyCategories]} visible={creating !== null} onClose={() => setCreating(null)} />
    </ScrollView>
  );
}

/** Server settings > Channels: every channel by category, with create, reorder, and a page per channel (name, topic, slowmode, age restriction, permissions, delete). Categories rename and delete in a sheet. */
export function ChannelsAdminScreen({ guildId }: { guildId: string }) {
  return (
    <PageGuard guildId={guildId} page="channels" title="Channels">
      <Body guildId={guildId} />
    </PageGuard>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  content: { paddingBottom: 40 },
  buttons: { flexDirection: 'row', gap: 10, padding: 16 },
  steps: { flexDirection: 'row' },
  step: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepOff: { opacity: 0.3 },
  hash: { color: theme.subtle, fontSize: 18, width: 18, textAlign: 'center' },
});
