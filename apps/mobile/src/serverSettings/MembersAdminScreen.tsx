import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { Avatar } from '../profile/Avatar';
import { getRuntime } from '../runtime';
import { useGuildPermissions } from '../servers/useGuildPermissions';
import { theme } from '../theme';
import { attempt } from '../ui/attempt';
import { ListRow } from '../ui/ListRow';
import { Sheet, SheetConfirm, SheetOption } from '../ui/Sheet';
import { moderationRows, type ModerationRow } from './memberAdminModel';
import { PageGuard } from './PageGuard';

function Body({ guildId }: { guildId: string }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const members = useGuildStore((s) => s.members[guildId]);
  const me = useSessionStore((s) => s.user?.id);
  const perms = useGuildPermissions(guildId);
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<ModerationRow | null>(null);
  const [pending, setPending] = useState<'Kick' | 'Ban' | null>(null);
  const rows = useMemo(() => (guild && me ? moderationRows(guild, perms, members, me, query) : []), [guild, perms, members, me, query]);

  const close = () => {
    setTarget(null);
    setPending(null);
  };

  const remove = async (row: ModerationRow, verb: 'Kick' | 'Ban') => {
    close();
    const api = getRuntime().api;
    const done = await attempt(async () => {
      if (verb === 'Ban') await api.ban(guildId, row.member.user.id);
      else await api.kickMember(guildId, row.member.user.id);
      return true;
    }, `Could not ${verb.toLowerCase()}`);
    if (done) useGuildStore.getState().removeMember(guildId, row.member.user.id);
  };

  return (
    <View style={styles.screen}>
      <TextInput
        accessibilityLabel="Search members"
        placeholder="Search members"
        placeholderTextColor={theme.subtle}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.search}
      />
      <FlatList
        data={rows}
        keyExtractor={(row) => row.member.user.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <ListRow
            title={item.name}
            subtitle={item.subtitle}
            left={<Avatar user={item.member.user} size={36} />}
            {...(item.rights.kick || item.rights.ban ? { onPress: () => setTarget(item), accessibilityLabel: `Moderate ${item.name}` } : {})}
          />
        )}
      />
      <Sheet visible={target !== null} title={pending && target ? `${pending} ${target.name}?` : target?.name} closeLabel="Close member actions" onClose={close}>
        {target && pending ? (
          <SheetConfirm
            body={pending === 'Ban' ? 'They are removed and cannot rejoin until unbanned.' : 'They can rejoin with a new invite.'}
            confirmLabel={pending}
            onConfirm={() => void remove(target, pending)}
            onCancel={close}
          />
        ) : (
          <>
            {target?.rights.kick && <SheetOption label="Kick" danger onPress={() => setPending('Kick')} />}
            {target?.rights.ban && <SheetOption label="Ban" danger onPress={() => setPending('Ban')} />}
            <SheetOption label="Cancel" onPress={close} />
          </>
        )}
      </Sheet>
    </View>
  );
}

/** Server settings > Members: search the members, and kick or ban the ones you outrank, each after a confirmation. */
export function MembersAdminScreen({ guildId }: { guildId: string }) {
  return (
    <PageGuard guildId={guildId} page="members" title="Members">
      <Body guildId={guildId} />
    </PageGuard>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  search: { margin: 12, paddingHorizontal: 12, height: 40, borderRadius: 10, backgroundColor: theme.raised, color: theme.text, fontSize: 15 },
});
