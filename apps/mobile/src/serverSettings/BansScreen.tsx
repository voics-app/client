import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Ban } from '@discordy/core/contracts/rest';
import { filterBans } from '@discordy/core/domain/moderationTools';
import { Permission } from '@discordy/core/contracts/permissions';
import { hasPermission } from '@discordy/core/domain/permissions';
import { useGuildPermissions } from '../servers/useGuildPermissions';
import { Avatar } from '../profile/Avatar';
import { getRuntime } from '../runtime';
import { theme } from '../theme';
import { attempt, confirmDestructive } from '../ui/attempt';
import { Button, Field, Notice } from '../ui/controls';
import { ListRow } from '../ui/ListRow';
import { PageGuard } from './PageGuard';

const nameOf = (ban: Ban) => ban.user.global_name || ban.user.username;

function Body({ guildId }: { guildId: string }) {
  const perms = useGuildPermissions(guildId);
  const mayBan = hasPermission(perms, Permission.BAN_MEMBERS);
  const mayAppeal = hasPermission(perms, Permission.MANAGE_BAN_APPEALS);
  const [bans, setBans] = useState<Ban[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [question, setQuestion] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [appeals, setAppeals] = useState<Awaited<ReturnType<ReturnType<typeof getRuntime>['api']['banAppeals']>>>([]);
  const [appealsFailed, setAppealsFailed] = useState(false);
  useEffect(() => {
    let live = true;
    if (mayBan) getRuntime().api.bans(guildId).then((list) => live && setBans(list)).catch(() => live && setFailed(true));
    if (mayAppeal) {
      getRuntime().api.appealForm(guildId).then((form) => live && setCurrentQuestion(form.question)).catch(() => undefined);
      getRuntime().api.banAppeals(guildId).then((list) => live && setAppeals(list)).catch(() => live && setAppealsFailed(true));
    }
    return () => { live = false; };
  }, [guildId, mayBan, mayAppeal]);
  const shown = useMemo(() => filterBans(bans ?? [], query), [bans, query]);
  const unban = (ban: Ban) => confirmDestructive(`Unban ${nameOf(ban)}?`, 'They will be able to rejoin with an invite.', 'Unban', () => {
    void attempt(async () => { await getRuntime().api.unban(guildId, ban.user.id); setBans((current) => current?.filter((b) => b.user.id !== ban.user.id) ?? null); if (mayAppeal) setAppeals(await getRuntime().api.banAppeals(guildId)); }, 'Could not unban');
  });
  const review = (id: string, decision: 'accept' | 'deny') => void attempt(async () => {
    await getRuntime().api.resolveBanAppeal(guildId, id, decision);
    setAppeals(await getRuntime().api.banAppeals(guildId));
    if (mayBan) setBans(await getRuntime().api.bans(guildId));
  }, 'Could not review appeal');
  const header = <View style={styles.appeals}>
    {mayAppeal && <>
      <Text style={styles.heading}>Ban appeals</Text>
      <Field label="Appeal question" value={question} onChangeText={setQuestion} maxLength={500} placeholder={currentQuestion ?? 'Why should we unban you?'} />
      <Button label="Save question" disabled={!question.trim()} onPress={() => void attempt(async () => { await getRuntime().api.setAppealForm(guildId, question); setCurrentQuestion(question.trim()); setQuestion(''); }, 'Could not save question')} />
      {currentQuestion && <Text style={styles.copy}>Current question: {currentQuestion}</Text>}
      {appealsFailed && <Notice>Could not load appeals.</Notice>}
      {appeals.map((appeal) => <View key={appeal.id} style={styles.appeal}>
        <Text style={styles.copy}>{appeal.user_id}</Text><Text style={styles.copy}>{appeal.question}</Text><Text style={styles.copy}>{appeal.answer}</Text>
        <Text style={styles.copy}>Status: {appeal.status}{appeal.resolved_by ? ` - Reviewed by ${appeal.resolved_by}` : ''}</Text>
        {appeal.status === 'open' && <><Button label="Accept and unban" onPress={() => review(appeal.id, 'accept')} /><Button label="Deny" onPress={() => review(appeal.id, 'deny')} /></>}
      </View>)}
    </>}
    {mayBan && <><Text style={styles.heading}>Current bans</Text>{failed ? <Notice>Could not load the bans.</Notice> : !bans ? <Notice>Loading bans...</Notice> : bans.length > 0 && <TextInput accessibilityLabel="Search bans" placeholder="Search by name, ID or reason" placeholderTextColor={theme.subtle} value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} style={styles.search} />}</>}
  </View>;
  return <View style={styles.screen}><FlatList data={mayBan ? shown : []} keyExtractor={(b) => b.user.id} keyboardShouldPersistTaps="handled" ListHeaderComponent={header} ListEmptyComponent={mayBan && bans ? <Notice>{bans.length === 0 ? 'Nobody is banned from this server.' : 'No matching bans.'}</Notice> : null} renderItem={({ item }) => <ListRow title={nameOf(item)} subtitle={item.reason ?? 'No reason given'} left={<Avatar user={item.user} size={36} />} right={<Button label="Unban" accessibilityLabel={`Unban ${nameOf(item)}`} onPress={() => unban(item)} />} />} /></View>;
}

/** Server settings > Bans: ordinary bans and appeal review, each gated by its own permission. */
export function BansScreen({ guildId }: { guildId: string }) {
  return (
    <PageGuard guildId={guildId} page="bans" title="Bans">
      <Body key={guildId} guildId={guildId} />
    </PageGuard>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  appeals: { padding: 12, gap: 8 },
  appeal: { padding: 10, gap: 6, backgroundColor: theme.raised },
  heading: { color: theme.text, fontSize: 18, fontWeight: '700' },
  copy: { color: theme.text, fontSize: 14 },
  search: { margin: 12, paddingHorizontal: 12, height: 44, borderRadius: 10, backgroundColor: theme.raised, color: theme.text, fontSize: 15 },
});
