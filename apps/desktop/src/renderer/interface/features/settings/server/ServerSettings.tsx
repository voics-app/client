import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useUiStore, type ServerSettingsTab } from '@discordy/core/application/stores/uiStore';
import { serverSettingsTabs } from '@discordy/core/domain/serverSettings';
import { useGuildPermissions } from '../../../shared/hooks/usePermissions';
import { Layout, NavGroup, NavItem, guarded } from '../SettingsLayout';
import { confirmDeleteServer } from './deleteServer';
import { ServerDiscovery } from './ServerDiscovery';
import { ServerTemplate } from './ServerTemplate';
import { ServerAudit, ServerBans, ServerEmoji, ServerInvites, ServerMembers } from './ServerTabs';
import { ServerProfile } from './ServerProfile';
import { ServerOverview } from './ServerOverview';
import { RolesEditor } from './RolesEditor';
import { ServerIntegrations } from '../../integrations/ServerIntegrations';

export function ServerSettings({ guildId, tab, auditTarget }: { guildId: string; tab: ServerSettingsTab; auditTarget?: { id: string; name: string } }) {
  const open = useUiStore((s) => s.openSettings);
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const me = useSessionStore((s) => s.user?.id);
  const perms = useGuildPermissions(guildId);
  if (!guild) return null;
  const tabs = serverSettingsTabs(perms).filter((entry) => entry.show);
  const selectedTab = tabs.find((entry) => entry.id === tab)?.id ?? tabs[0]?.id ?? 'members';
  const body = { overview: <ServerOverview guildId={guildId} />, profile: <ServerProfile guildId={guildId} />, roles: <RolesEditor guildId={guildId} />, emoji: <ServerEmoji guildId={guildId} />, members: <ServerMembers guildId={guildId} />, invites: <ServerInvites guildId={guildId} />, template: <ServerTemplate guildId={guildId} />, discovery: <ServerDiscovery guildId={guildId} />, bans: <ServerBans guildId={guildId} />, audit: <ServerAudit guildId={guildId} target={auditTarget} />, integrations: <ServerIntegrations guildId={guildId} /> }[selectedTab];
  return (
    <Layout title="Server settings" nav={<>{(['Server', 'People', 'Moderation'] as const).map((group) => {
      const entries = tabs.filter((entry) => entry.group === group);
      return entries.length > 0 && <NavGroup key={group} title={group === 'Server' ? guild.name : group}>{entries.map((entry) => <NavItem key={entry.id} active={selectedTab === entry.id} onClick={guarded(() => open({ kind: 'server', guildId, tab: entry.id }))}>{entry.label}</NavItem>)}</NavGroup>;
    })}</>} footer={guild.owner_id === me ? <div className="settings-group settings-logout"><NavItem active={false} danger onClick={guarded(() => confirmDeleteServer(guildId))}>Delete server</NavItem></div> : undefined}>
      {body}
    </Layout>
  );
}
