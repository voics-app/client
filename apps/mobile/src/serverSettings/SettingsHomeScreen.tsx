import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useGuildPermissions } from '../servers/useGuildPermissions';
import { theme } from '../theme';
import { Notice } from '../ui/controls';
import { ListRow } from '../ui/ListRow';
import { settingsPages } from './settingsPages';

/** Desktop's server settings navigation: one row per page the user may open. */
export function SettingsHomeScreen({ guildId }: { guildId: string }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const perms = useGuildPermissions(guildId);
  if (!guild) return <Notice>This server is not available.</Notice>;
  const pages = settingsPages(perms);
  return (
    <ScrollView style={styles.screen}>
      {pages.length === 0 && <Notice>You can't change anything in this server.</Notice>}
      {pages.map((p) => (
        <ListRow
          key={p.id}
          title={p.label}
          subtitle={p.hint}
          left={<Ionicons name={p.icon} size={22} color={theme.muted} />}
          onPress={() => router.push(`/servers/${guildId}/settings/${p.id}`)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: theme.background } });
