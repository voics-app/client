import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import type { Role } from '@discordy/core/contracts/rest';
import { permissionsByGroup } from '@discordy/core/domain/permissionCatalog';
import { hasPermission, parsePermissions, togglePermission } from '@discordy/core/domain/permissions';
import { isAdministrator } from '@discordy/core/domain/roleManagement';
import { getRuntime } from '../runtime';
import { useGuildPermissions } from '../servers/useGuildPermissions';
import { theme } from '../theme';
import { attempt, confirmDestructive } from '../ui/attempt';
import { Button, Field, SectionTitle } from '../ui/controls';
import { PageGuard } from './PageGuard';
import { fromHex, roleAccess, roleEditRules, SWATCHES, toHex } from './roleModel';

const GROUPS = permissionsByGroup(false);

function Toggle({ label, hint, value, disabled, onChange }: { label: string; hint?: string; value: boolean; disabled?: boolean; onChange(value: boolean): void }) {
  return (
    <View style={styles.toggle}>
      <View style={styles.toggleCopy}>
        <Text style={styles.toggleTitle}>{label}</Text>
        {hint ? <Text style={styles.toggleHint}>{hint}</Text> : null}
      </View>
      <Switch accessibilityLabel={label} value={value} disabled={disabled} onValueChange={onChange} />
    </View>
  );
}

function Body({ guildId, roleId }: { guildId: string; roleId: string }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const members = useGuildStore((s) => s.members[guildId]);
  const me = useSessionStore((s) => s.user?.id);
  const perms = useGuildPermissions(guildId);
  const saved = guild?.roles.find((r) => r.id === roleId);
  const [draft, setDraft] = useState<Role | null>(saved ?? null);
  const [hex, setHex] = useState(saved ? toHex(saved.color) : '');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setDraft(saved ?? null);
    setHex(saved ? toHex(saved.color) : '');
  }, [saved]);

  const access = useMemo(() => (guild && me ? roleAccess({ guild, perms, userId: me, memberRoleIds: members?.[me]?.roles ?? [] }) : null), [guild, perms, me, members]);
  if (!guild || !saved || !draft || !access) return <Text style={styles.note}>This role is not available.</Text>;
  const rules = roleEditRules(saved, guildId, perms, access);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved) && draft.name.trim() !== '';
  const held = parsePermissions(draft.permissions);

  const setColor = (color: number) => {
    setDraft({ ...draft, color });
    setHex(toHex(color));
  };

  const save = async () => {
    setSaving(true);
    const updated = await attempt(
      () =>
        getRuntime().api.updateRole(guildId, draft.id, {
          name: draft.name.trim(),
          color: draft.color,
          hoist: draft.hoist,
          mentionable: draft.mentionable,
          permissions: draft.permissions,
          unicode_emoji: draft.unicode_emoji ?? null,
        }),
      'Could not save role',
    );
    setSaving(false);
    if (updated) useGuildStore.getState().upsertRole(guildId, updated);
  };

  const remove = () =>
    confirmDestructive(`Delete ${saved.name}?`, 'Members lose the permissions this role gave them.', 'Delete role', () => {
      void (async () => {
        const done = await attempt(async () => {
          await getRuntime().api.deleteRole(guildId, saved.id);
          return true;
        }, 'Could not delete role');
        if (!done) return;
        useGuildStore.getState().removeRole(guildId, saved.id);
        router.back();
      })();
    });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {!rules.editable && <Text style={styles.note}>You cannot edit this role because it is at or above your highest role.</Text>}
      {rules.showDisplay && (
        <>
          <Field label="Role name" value={draft.name} maxLength={100} editable={rules.editable} autoCapitalize="sentences" onChangeText={(name) => setDraft({ ...draft, name })} />
          <Text style={styles.label}>Colour</Text>
          <View style={styles.swatches}>
            {SWATCHES.map((c) => (
              <Pressable
                key={c}
                accessibilityRole="button"
                accessibilityLabel={`Colour ${c}`}
                accessibilityState={{ selected: draft.color === fromHex(c), disabled: !rules.editable }}
                disabled={!rules.editable}
                onPress={() => setColor(fromHex(c)!)}
                style={[styles.swatch, { backgroundColor: c }, draft.color === fromHex(c) && styles.swatchOn]}
              />
            ))}
          </View>
          <Field
            label="Custom colour"
            value={hex}
            maxLength={7}
            editable={rules.editable}
            onChangeText={(text) => {
              setHex(text);
              const color = fromHex(text);
              if (color !== null) setDraft({ ...draft, color });
            }}
          />
          <Toggle label="Display separately" hint="Show members with this role as their own group in the member list." value={draft.hoist} disabled={!rules.editable} onChange={(hoist) => setDraft({ ...draft, hoist })} />
          <Toggle label="Allow anyone to mention this role" value={draft.mentionable} disabled={!rules.editable} onChange={(mentionable) => setDraft({ ...draft, mentionable })} />
        </>
      )}
      {isAdministrator(draft.permissions) && <Text style={styles.warning}>Administrator grants every permission and bypasses channel overwrites. Only give it to people you trust.</Text>}
      {GROUPS.map(({ group, entries }) => (
        <View key={group}>
          <SectionTitle>{group}</SectionTitle>
          {entries.map((p) => (
            <Toggle
              key={p.name}
              label={p.label}
              hint={p.description}
              value={hasPermission(held, p.bit)}
              disabled={rules.bitLocked(p.bit)}
              onChange={(on) => setDraft({ ...draft, permissions: togglePermission(draft.permissions, p.bit, on) })}
            />
          ))}
        </View>
      ))}
      {rules.editable && (
        <View style={styles.actions}>
          <Button tone="primary" label="Save changes" busy={saving} disabled={!dirty} onPress={() => void save()} />
          {rules.canDelete && <Button tone="danger" label="Delete role" onPress={remove} />}
        </View>
      )}
    </ScrollView>
  );
}

/** One role: name, colour, display options and every permission, with each control locked the way the desktop locks it for this user. */
export function RoleEditScreen({ guildId, roleId }: { guildId: string; roleId: string }) {
  const name = useGuildStore((s) => s.guilds[guildId]?.roles.find((r) => r.id === roleId)?.name ?? 'Role');
  return (
    <PageGuard guildId={guildId} page="roles" title={roleId === guildId ? '@everyone' : name}>
      <Body guildId={guildId} roleId={roleId} />
    </PageGuard>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  content: { padding: 20, paddingBottom: 48 },
  note: { color: theme.muted, fontSize: 14, marginBottom: 16, textAlign: 'center' },
  warning: { color: theme.danger, fontSize: 13, marginVertical: 12 },
  label: { color: theme.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'transparent' },
  swatchOn: { borderColor: theme.text },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  toggleCopy: { flex: 1 },
  toggleTitle: { color: theme.text, fontSize: 16 },
  toggleHint: { color: theme.subtle, fontSize: 13, marginTop: 2 },
  actions: { gap: 10, marginTop: 24 },
});
