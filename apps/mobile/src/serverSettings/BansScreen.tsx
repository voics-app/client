import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import type { Ban } from '@discordy/core/contracts/rest';
import { filterBans } from '@discordy/core/domain/moderationTools';
import { Avatar } from '../profile/Avatar';
import { getRuntime } from '../runtime';
import { theme } from '../theme';
import { attempt, confirmDestructive } from '../ui/attempt';
import { Button, Notice } from '../ui/controls';
import { ListRow } from '../ui/ListRow';
import { PageGuard } from './PageGuard';

const nameOf = (ban: Ban) => ban.user.global_name || ban.user.username;

function Body({ guildId }: { guildId: string }) {
  const [bans, setBans] = useState<Ban[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => {
    let live = true;
    getRuntime()
      .api.bans(guildId)
      .then((list) => live && setBans(list))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [guildId]);
  const shown = useMemo(() => filterBans(bans ?? [], query), [bans, query]);

  const unban = (ban: Ban) =>
    confirmDestructive(`Unban ${nameOf(ban)}?`, 'They will be able to rejoin with an invite.', 'Unban', () => {
      void attempt(async () => {
        await getRuntime().api.unban(guildId, ban.user.id);
        setBans((current) => current?.filter((b) => b.user.id !== ban.user.id) ?? null);
      }, 'Could not unban');
    });

  if (failed) return <Notice>Could not load the bans.</Notice>;
  if (!bans) return <Notice>Loading bans...</Notice>;
  return (
    <View style={styles.screen}>
      {bans.length > 0 && <TextInput accessibilityLabel="Search bans" placeholder="Search by name, ID or reason" placeholderTextColor={theme.subtle} value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} style={styles.search} />}
      <FlatList
        data={shown}
        keyExtractor={(b) => b.user.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Notice>{bans.length === 0 ? 'Nobody is banned from this server.' : 'No matching bans.'}</Notice>}
        renderItem={({ item }) => (
          <ListRow title={nameOf(item)} subtitle={item.reason ?? 'No reason given'} left={<Avatar user={item.user} size={36} />} right={<Button label="Unban" accessibilityLabel={`Unban ${nameOf(item)}`} onPress={() => unban(item)} />} />
        )}
      />
    </View>
  );
}

/** Server settings > Bans: the people who cannot rejoin, searchable, with Unban (after a question). Needs Ban Members. */
export function BansScreen({ guildId }: { guildId: string }) {
  return (
    <PageGuard guildId={guildId} page="bans" title="Bans">
      <Body guildId={guildId} />
    </PageGuard>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  search: { margin: 12, paddingHorizontal: 12, height: 44, borderRadius: 10, backgroundColor: theme.raised, color: theme.text, fontSize: 15 },
});
