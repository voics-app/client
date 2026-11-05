import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { Avatar } from '../profile/Avatar';
import { theme } from '../theme';
import { Notice } from '../ui/controls';
import { ListRow } from '../ui/ListRow';
import { confirmLogout } from './logout';
import { SectionLabel } from './rows';
import { USER_PAGES, searchUserSettings, type UserPageId } from './userPages';

export const openSettingsPage = (page: UserPageId, rowId: string | null = null) => router.push(rowId ? `/settings/${page}?row=${rowId}` : `/settings/${page}`);

/** The user settings: a search field over every page and row, then the pages grouped as on desktop, then Log out. */
export function SettingsHome() {
  const user = useSessionStore((s) => s.user);
  const [query, setQuery] = useState('');
  const hits = searchUserSettings(query);
  const searching = query.trim() !== '';
  return (
    <ScrollView style={styles.screen} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={theme.subtle} />
        <TextInput accessibilityLabel="Search settings" placeholder="Search settings" placeholderTextColor={theme.subtle} value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} returnKeyType="search" clearButtonMode="while-editing" style={styles.input} />
      </View>
      {searching ? (
        <>
          {hits.length === 0 && <Notice>{`No settings match "${query.trim()}".`}</Notice>}
          {hits.map((hit) => (
            <ListRow key={`${hit.page}/${hit.rowId ?? ''}`} title={hit.label} subtitle={hit.rowId === null ? undefined : hit.pageLabel} onPress={() => openSettingsPage(hit.page, hit.rowId)} accessibilityLabel={hit.rowId === null ? hit.label : `${hit.label}, ${hit.pageLabel}`} />
          ))}
        </>
      ) : (
        <>
          {user && (
            <ListRow
              title={user.global_name || user.username}
              subtitle={user.username}
              left={<Avatar user={user} size={44} />}
              onPress={() => openSettingsPage('account')}
              accessibilityLabel="My account"
            />
          )}
          {(['User settings', 'App settings'] as const).map((group) => (
            <View key={group}>
              <SectionLabel>{group}</SectionLabel>
              {USER_PAGES.filter((p) => p.group === group).map((p) => (
                <ListRow key={p.id} title={p.label} subtitle={p.hint} left={<Ionicons name={p.icon} size={22} color={theme.muted} />} onPress={() => openSettingsPage(p.id)} />
              ))}
            </View>
          ))}
          <View style={styles.logout}>
            <ListRow title="Log out" danger left={<Ionicons name="log-out-outline" size={22} color={theme.danger} />} onPress={confirmLogout} />
          </View>
          <Text style={styles.note}>Voice and video settings, keybinds and the desktop options are on the desktop app.</Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, paddingHorizontal: 12, minHeight: 44, borderRadius: 12, backgroundColor: theme.raised },
  input: { flex: 1, minHeight: 44, color: theme.text, fontSize: 16 },
  logout: { marginTop: 20 },
  note: { color: theme.subtle, fontSize: 13, padding: 16, paddingBottom: 48 },
});
