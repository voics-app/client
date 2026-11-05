import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import type { AuditLogEntry, User } from '@discordy/core/contracts/rest';
import { AUDIT_ACTIONS } from '@discordy/core/domain/auditActions';
import { AUDIT_FILTERS } from '@discordy/core/domain/moderationTools';
import { timestampOf } from '@discordy/core/domain/snowflake';
import { Avatar } from '../profile/Avatar';
import { memberName } from '../members/memberListModel';
import { getRuntime } from '../runtime';
import { useLastValue } from '../sheets/useLastValue';
import { theme } from '../theme';
import { Button, Notice } from '../ui/controls';
import { ListRow } from '../ui/ListRow';
import { Sheet, SheetOption } from '../ui/Sheet';
import { PageGuard } from './PageGuard';

export const AUDIT_PAGE = 100;

/** "Pat banned a member": who did it and what, as desktop words it. */
export const auditLine = (entry: AuditLogEntry, actor: User | undefined): string =>
  `${actor ? actor.global_name || actor.username : 'Unknown'} ${AUDIT_ACTIONS[entry.action_type] ?? `performed action ${entry.action_type}`}`;

type Picker = 'action' | 'moderator' | null;

function Body({ guildId }: { guildId: string }) {
  const members = useGuildStore((s) => s.members[guildId]);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [users, setUsers] = useState<Record<string, User>>({});
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [actionType, setActionType] = useState<number | null>(null);
  const [actorId, setActorId] = useState<string | null>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const shownPicker = useLastValue(picker);

  const load = useCallback(
    async (before?: string) => {
      setLoading(true);
      setFailed(false);
      try {
        const page = await getRuntime().api.auditLog(guildId, { limit: AUDIT_PAGE, ...(actionType !== null ? { action_type: actionType } : {}), ...(actorId ? { user_id: actorId } : {}), ...(before ? { before } : {}) });
        setEntries((cur) => (before ? [...cur, ...page.audit_log_entries] : page.audit_log_entries));
        setUsers((cur) => ({ ...(before ? cur : {}), ...Object.fromEntries((page.users ?? []).map((u) => [u.id, u])) }));
        setMore(page.audit_log_entries.length >= AUDIT_PAGE);
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    },
    [guildId, actionType, actorId],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const actionLabel = AUDIT_FILTERS.find((f) => f.value === actionType)?.label ?? 'All actions';
  const actorLabel = actorId && members?.[actorId] ? memberName(members[actorId]!) : 'Everyone';
  const header = (
    <View style={styles.filters}>
      <Button label={actionLabel} accessibilityLabel={`Filter by action: ${actionLabel}`} onPress={() => setPicker('action')} />
      <Button label={actorLabel} accessibilityLabel={`Filter by moderator: ${actorLabel}`} onPress={() => setPicker('moderator')} />
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        ListHeaderComponent={header}
        ListEmptyComponent={loading ? <Notice>Loading the audit log...</Notice> : failed ? <Notice>Could not load the audit log.</Notice> : <Notice>Nothing logged yet.</Notice>}
        ListFooterComponent={more ? <View style={styles.more}><Button label="Load older entries" busy={loading} onPress={() => void load(entries[entries.length - 1]?.id)} /></View> : undefined}
        renderItem={({ item }) => {
          const actor = item.user_id ? (users[item.user_id] ?? members?.[item.user_id]?.user) : undefined;
          return (
            <ListRow
              title={auditLine(item, actor)}
              subtitle={[item.reason ? `Reason: ${item.reason}` : '', new Date(timestampOf(item.id)).toLocaleString()].filter(Boolean).join('\n')}
              left={actor ? <Avatar user={actor} size={32} /> : undefined}
            />
          );
        }}
      />
      <Sheet visible={picker !== null} title={shownPicker === 'moderator' ? 'Filter by moderator' : 'Filter by action'} closeLabel="Close filter" onClose={() => setPicker(null)}>
        {shownPicker === 'action' && (
          <>
            <SheetOption label="All actions" onPress={() => { setActionType(null); setPicker(null); }} />
            {AUDIT_FILTERS.map((f) => <SheetOption key={f.value} label={f.label} onPress={() => { setActionType(f.value); setPicker(null); }} />)}
          </>
        )}
        {shownPicker === 'moderator' && (
          <>
            <SheetOption label="Everyone" onPress={() => { setActorId(null); setPicker(null); }} />
            {Object.values(members ?? {}).map((m) => <SheetOption key={m.user.id} label={memberName(m)} onPress={() => { setActorId(m.user.id); setPicker(null); }} />)}
          </>
        )}
      </Sheet>
    </View>
  );
}

/** Server settings > Audit log: moderation and configuration actions, newest first, filtered by action and moderator, with older entries on request. Needs View Audit Log. */
export function AuditScreen({ guildId }: { guildId: string }) {
  return (
    <PageGuard guildId={guildId} page="audit" title="Audit log">
      <Body guildId={guildId} />
    </PageGuard>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  filters: { gap: 8, padding: 12 },
  more: { padding: 16 },
});
