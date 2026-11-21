import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { confirmAgeRestrictedChannel } from '@discordy/core/application/ageRestrictedAccess';
import { leaveGuild } from '@discordy/core/application/guildCommands';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { createI18n } from '@discordy/core/domain/i18n';
import { getRuntime } from '../runtime';
import { theme } from '../theme';
import { attempt } from '../ui/attempt';
import { Button } from '../ui/controls';
import { useChannelContentAccess } from './useChannelContentAccess';
import { ReportSheet } from '../report/ReportSheet';
import type { ReportTarget } from '@discordy/core/domain/reportModel';

/** No blocked screen mounts: effects, cached rows and remote images remain behind this boundary. */
export function AgeRestrictedGate({ channelId, children, onExit }: { channelId: string; children: ReactNode; onExit?: () => void }) {
  const { kind } = useChannelContentAccess().access(channelId);
  const channel = useGuildStore((s) => s.channels[channelId]);
  const guild = useGuildStore((s) => channel?.guild_id ? s.guilds[channel.guild_id] : undefined);
  const me = useSessionStore((s) => s.user?.id);
  const locale = useSessionStore((s) => s.settings.locale);
  const { t } = createI18n(locale);
  const [report, setReport] = useState<ReportTarget | null>(null);
  if (kind === 'open') return children;
  const exit = () => { useUiStore.getState().navigate({ kind: 'home', channelId: null }); onExit?.(); router.replace('/dms'); };
  const leave = () => Alert.alert(t('age.leaveTitle'), t('age.leaveBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('age.leave'), style: 'destructive', onPress: () => {
      void attempt(async () => { await leaveGuild(getRuntime().api, guild!.id); exit(); }, t('age.leaveError'));
    } },
  ]);
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Ionicons name="shield-outline" size={40} color={theme.muted} accessible={false} />
    <Text accessibilityRole="header" style={styles.title}>{t(kind === 'unavailable' ? 'age.unavailable' : kind === 'hidden' ? 'age.hidden' : 'age.title')}</Text>
    {kind === 'confirm' && <Text style={styles.channel}>#{channel?.name}</Text>}
    <Text style={styles.body}>{t(kind === 'unavailable' ? 'age.unavailableBody' : kind === 'hidden' ? 'age.hiddenBody' : 'age.body')}</Text>
    <View style={styles.actions}>
      {kind === 'confirm' && <Button label={t('age.continue')} tone="primary" onPress={() => confirmAgeRestrictedChannel(channelId)} />}
      <Button label={t('age.back')} onPress={exit} />
      <Button label={t('age.settings')} onPress={() => router.push('/settings/privacy')} />
      {channel?.guild_id && <Button label={t('age.report')} onPress={() => setReport({ kind: 'channel', channelId, channelName: channel.name ?? channelId })} />}
      {guild && guild.owner_id !== me && <Button label={t('age.leave')} onPress={leave} />}
    </View>
    <ReportSheet target={report} onClose={() => setReport(null)} />
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  title: { color: theme.text, fontSize: 24, fontWeight: '600', textAlign: 'center' },
  channel: { color: theme.text, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  body: { color: theme.muted, fontSize: 16, lineHeight: 24, textAlign: 'center', maxWidth: 480 },
  actions: { alignSelf: 'stretch', gap: 8, maxWidth: 480, width: '100%' },
});
