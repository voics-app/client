import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { ChannelType, type Channel, type PermissionOverwrite } from '@discordy/core/contracts/rest';
import { permissionsByGroup } from '@discordy/core/domain/permissionCatalog';
import { overwriteStateOf, withOverwriteState, type OverwriteState } from '@discordy/core/domain/permissions';
import { memberName } from '../members/memberListModel';
import { getRuntime } from '../runtime';
import { theme } from '../theme';
import { attempt, confirmDestructive } from '../ui/attempt';
import { Button, Choices, Field, Notice, SectionTitle } from '../ui/controls';
import { Sheet, SheetOption } from '../ui/Sheet';
import { channelPatch, draftOfChannel, isVoiceChannel, overwriteChanges, SLOWMODE_OPTIONS, TOPIC_MAX, type ChannelDraft } from './channelEditModel';
import { PageGuard } from './PageGuard';

const STATES: { state: OverwriteState; label: string }[] = [
  { state: 'deny', label: 'Deny' },
  { state: 'inherit', label: 'Inherit' },
  { state: 'allow', label: 'Allow' },
];

function TriState({ label, state, onChange }: { label: string; state: OverwriteState; onChange(state: OverwriteState): void }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.tri}>
      {STATES.map((s) => (
        <Pressable key={s.state} accessibilityRole="radio" accessibilityLabel={`${label}: ${s.label}`} accessibilityState={{ selected: state === s.state }} onPress={() => onChange(s.state)} style={[styles.triOption, state === s.state && styles[s.state]]}>
          <Text style={[styles.triText, state === s.state && styles.triTextOn]}>{s.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Overwrites({ channel }: { channel: Channel }) {
  const guildId = channel.guild_id!;
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const members = useGuildStore((s) => s.members[guildId]);
  const saved = channel.permission_overwrites ?? [];
  const [draft, setDraft] = useState<PermissionOverwrite[]>(saved);
  const [selectedId, setSelectedId] = useState<string>(guildId);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  if (!guild) return null;

  const changes = overwriteChanges(saved, draft);
  const dirty = changes.put.length > 0 || changes.remove.length > 0;
  const current = draft.find((o) => o.id === selectedId) ?? { id: selectedId, type: 0 as const, allow: '0', deny: '0' };
  const nameOf = (o: PermissionOverwrite) => (o.type === 0 ? (o.id === guildId ? '@everyone' : (guild.roles.find((r) => r.id === o.id)?.name ?? 'role')) : members?.[o.id] ? memberName(members[o.id]!) : o.id);
  const upsert = (o: PermissionOverwrite) => setDraft((d) => (d.some((x) => x.id === o.id) ? d.map((x) => (x.id === o.id ? o : x)) : [...d, o]));
  const targets = [...draft, ...(draft.some((o) => o.id === guildId) ? [] : [{ id: guildId, type: 0 as const, allow: '0', deny: '0' }])];
  const addable = [
    ...guild.roles.filter((r) => !targets.some((o) => o.id === r.id)).map((r) => ({ id: r.id, type: 0 as const, label: r.name })),
    ...Object.values(members ?? {}).slice(0, 50).filter((m) => !targets.some((o) => o.id === m.user.id)).map((m) => ({ id: m.user.id, type: 1 as const, label: `@${memberName(m)}` })),
  ];

  const save = async () => {
    setSaving(true);
    const api = getRuntime().api;
    const done = await attempt(async () => {
      for (const o of changes.put) await api.putOverwrite(channel.id, o);
      for (const id of changes.remove) await api.deleteOverwrite(channel.id, id);
      useGuildStore.getState().upsertChannel({ ...channel, permission_overwrites: draft });
      return true;
    }, 'Could not save permissions');
    setSaving(false);
    if (!done) return;
  };

  return (
    <View>
      <Text style={styles.hint}>Overwrites win over role permissions. Deny beats allow within the same layer.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.targets}>
        {targets.map((o) => (
          <Pressable key={o.id} accessibilityRole="button" accessibilityLabel={`Overwrites for ${nameOf(o)}`} accessibilityState={{ selected: o.id === selectedId }} onPress={() => setSelectedId(o.id)} style={[styles.target, o.id === selectedId && styles.targetOn]}>
            <Text style={[styles.targetText, o.id === selectedId && styles.targetTextOn]}>{nameOf(o)}</Text>
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" accessibilityLabel="Add role or member" onPress={() => setAdding(true)} style={styles.target}>
          <Text style={styles.targetText}>+ Add</Text>
        </Pressable>
      </ScrollView>
      {permissionsByGroup(true).map(({ group, entries }) => (
        <View key={group}>
          <SectionTitle>{group}</SectionTitle>
          {entries.map((p) => (
            <View key={p.name} style={styles.perm}>
              <Text style={styles.permLabel}>{p.label}</Text>
              <TriState label={p.label} state={overwriteStateOf(current, p.bit)} onChange={(state) => upsert(withOverwriteState(current, p.bit, state))} />
            </View>
          ))}
        </View>
      ))}
      <View style={styles.save}>
        <Button label="Save permissions" tone="primary" busy={saving} disabled={!dirty} onPress={() => void save()} />
        <Button label="Discard changes" disabled={!dirty || saving} onPress={() => setDraft(saved)} />
      </View>
      <Sheet visible={adding} title="Add role or member" closeLabel="Close add overwrite" onClose={() => setAdding(false)}>
        {addable.length === 0 && <Text style={styles.hint}>Everyone is already listed.</Text>}
        {addable.map((a) => (
          <SheetOption
            key={a.id}
            label={a.label}
            onPress={() => {
              upsert({ id: a.id, type: a.type, allow: '0', deny: '0' });
              setSelectedId(a.id);
              setAdding(false);
            }}
          />
        ))}
      </Sheet>
    </View>
  );
}

function Overview({ channel }: { channel: Channel }) {
  const [draft, setDraft] = useState<ChannelDraft>(() => draftOfChannel(channel));
  const [saving, setSaving] = useState(false);
  const voice = isVoiceChannel(channel);
  const patch = channelPatch(channel, draft);
  const set = (change: Partial<ChannelDraft>) => setDraft((d) => ({ ...d, ...change }));

  const save = async () => {
    if (!patch) return;
    setSaving(true);
    const updated = await attempt(() => getRuntime().api.updateChannel(channel.id, patch), 'Could not save channel');
    setSaving(false);
    if (updated) {
      useGuildStore.getState().upsertChannel({ ...channel, ...updated, guild_id: channel.guild_id });
      setDraft(draftOfChannel({ ...channel, ...updated }));
    }
  };

  const remove = () =>
    confirmDestructive(`Delete #${channel.name}?`, 'Messages in this channel will be lost for everyone.', 'Delete channel', () => {
      void attempt(async () => {
        await getRuntime().api.deleteChannel(channel.id);
        useGuildStore.getState().removeChannel(channel.id);
        router.back();
      }, 'Could not delete channel');
    });

  return (
    <View style={styles.form}>
      <Field label="Channel name" value={draft.name} maxLength={100} onChangeText={(name) => set({ name })} />
      {!voice && <Field label="Topic" value={draft.topic} maxLength={TOPIC_MAX} multiline autoCapitalize="sentences" onChangeText={(topic) => set({ topic })} />}
      {!voice && <Choices<number> label="Slowmode" options={SLOWMODE_OPTIONS} value={draft.slowmode} onChange={(slowmode) => set({ slowmode })} />}
      {voice && <Field label="User limit (0 = unlimited)" value={String(draft.userLimit)} keyboardType="number-pad" maxLength={2} onChangeText={(v) => set({ userLimit: Number(v) || 0 })} />}
      {voice && <Field label="Bitrate (kbps)" value={String(draft.bitrateKbps)} keyboardType="number-pad" maxLength={3} onChangeText={(v) => set({ bitrateKbps: Number(v) || 0 })} />}
      <View style={styles.switchRow}>
        <Text style={styles.permLabel}>Age-restricted channel</Text>
        <Switch accessibilityLabel="Age-restricted channel" value={draft.nsfw} onValueChange={(nsfw) => set({ nsfw })} trackColor={{ true: theme.accent }} />
      </View>
      <Button label="Save changes" tone="primary" busy={saving} disabled={!patch} onPress={() => void save()} />
      <View style={styles.gap} />
      <Button label="Delete channel" tone="danger" onPress={remove} />
    </View>
  );
}

function Body({ channelId }: { channelId: string }) {
  const channel = useGuildStore((s) => s.channels[channelId]);
  const [tab, setTab] = useState<'overview' | 'permissions'>('overview');
  if (!channel || !channel.guild_id || channel.type === ChannelType.GUILD_CATEGORY) return <Notice>This channel is not available.</Notice>;
  return (
    <ScrollView style={styles.screen} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Text style={styles.title}>{`#${channel.name}`}</Text>
      <Choices<'overview' | 'permissions'> label="Section" options={[{ value: 'overview', label: 'Overview' }, { value: 'permissions', label: 'Permissions' }]} value={tab} onChange={setTab} />
      {tab === 'overview' ? <Overview channel={channel} /> : <Overwrites channel={channel} />}
    </ScrollView>
  );
}

/** One channel's settings (Manage Channels): name, topic, slowmode, age restriction, voice limits and delete, and its permission overwrites for roles and members. */
export function ChannelEditScreen({ guildId, channelId }: { guildId: string; channelId: string }) {
  return (
    <PageGuard guildId={guildId} page="channels" title="Channel settings">
      <Body channelId={channelId} />
    </PageGuard>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  content: { padding: 16, paddingBottom: 48 },
  title: { color: theme.text, fontSize: 20, fontWeight: '700', marginBottom: 12 },
  form: { marginTop: 4 },
  gap: { height: 12 },
  hint: { color: theme.subtle, fontSize: 13, paddingVertical: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, marginBottom: 12 },
  perm: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 52 },
  permLabel: { color: theme.text, fontSize: 15, flexShrink: 1 },
  tri: { flexDirection: 'row', borderRadius: 10, overflow: 'hidden', backgroundColor: theme.raised },
  triOption: { minWidth: 56, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  triText: { color: theme.muted, fontSize: 13 },
  triTextOn: { color: theme.accentText, fontWeight: '700' },
  deny: { backgroundColor: theme.danger },
  inherit: { backgroundColor: theme.raisedHover },
  allow: { backgroundColor: theme.success },
  targets: { gap: 8, paddingVertical: 8 },
  target: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: theme.raised, justifyContent: 'center' },
  targetOn: { backgroundColor: theme.accentSoft, borderWidth: 1, borderColor: theme.accent },
  targetText: { color: theme.muted, fontSize: 14 },
  targetTextOn: { color: theme.text },
  save: { gap: 8, paddingTop: 16 },
});
