import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useUiStore, type ServerSettingsTab, type SettingsTarget, type UserSettingsTab } from '@renderer/application/stores/uiStore';
import { Permission } from '@shared/contracts/permissions';
import { can, useGuildPermissions } from '../../shared/hooks/usePermissions';
import { useDialogFocus } from '../../shared/hooks/useDialogFocus';
import { gentle } from '../../shared/ui/motion';
import { SettingsCloseButton } from './SettingsCloseButton';
import { ChannelSettings } from './channel/ChannelSettings';
import { ServerAudit, ServerBans, ServerEmoji, ServerInvites, ServerMembers, ServerOverview } from './server/ServerTabs';
import { RolesEditor } from './server/RolesEditor';
import { AboutTab, AccountTab, DesktopTab, AppearanceTab, ConnectionTab, DevicesTab, KeybindsTab, NotificationsTab, PrivacyTab, ProfileTab, VoiceTab } from './user/UserTabs';

const USER_TABS: { id: UserSettingsTab; label: string; group: string }[] = [
  { id: 'account', label: 'My account', group: 'User settings' },
  { id: 'profile', label: 'Profile', group: 'User settings' },
  { id: 'privacy', label: 'Privacy and delivery', group: 'User settings' },
  { id: 'devices', label: 'Devices', group: 'User settings' },
  { id: 'voice', label: 'Voice and video', group: 'App settings' },
  { id: 'keybinds', label: 'Keybinds', group: 'App settings' },
  { id: 'appearance', label: 'Appearance', group: 'App settings' },
  { id: 'notifications', label: 'Notifications', group: 'App settings' },
  { id: 'connection', label: 'Connection', group: 'App settings' },
  { id: 'desktop', label: 'Desktop', group: 'App settings' },
  { id: 'about', label: 'About and updates', group: 'App settings' },
];

function Layout({ title, nav, children, onClose, footer }: { title: string; nav: ReactNode; children: ReactNode; onClose: () => void; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref);
  useEffect(() => {
    // Dialogs and menus opened on top of settings stop Escape in the capture phase, so only a bare Escape arrives here.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div ref={ref} tabIndex={-1} className="settings" role="dialog" aria-modal="true" aria-label={title}>
      <nav className="settings-nav">{nav}{footer}</nav>
      <div className="settings-content">
        <div className="settings-inner">{children}</div>
        <SettingsCloseButton onClose={onClose} />
      </div>
    </div>
  );
}

function NavGroup({ title, children }: { title: string; children: ReactNode }) {
  return <div className="settings-group"><h3>{title}</h3>{children}</div>;
}

function NavItem({ active, onClick, children, danger }: { active: boolean; onClick: () => void; children: ReactNode; danger?: boolean }) {
  return <button type="button" className={`settings-item${active ? ' is-active' : ''}${danger ? ' is-danger' : ''}`} onClick={onClick} aria-current={active || undefined}>{children}</button>;
}

function UserSettings({ tab }: { tab: UserSettingsTab }) {
  const open = useUiStore((s) => s.openSettings);
  let lastGroup = '';
  const body = { account: <AccountTab />, profile: <ProfileTab />, privacy: <PrivacyTab />, devices: <DevicesTab />, voice: <VoiceTab />, keybinds: <KeybindsTab />, appearance: <AppearanceTab />, notifications: <NotificationsTab />, connection: <ConnectionTab />, desktop: <DesktopTab />, about: <AboutTab /> }[tab];
  return (
    <Layout title="User settings" onClose={() => open(null)} nav={USER_TABS.map((t) => {
      const heading = t.group !== lastGroup ? <h3 key={`h-${t.group}`}>{t.group}</h3> : null;
      lastGroup = t.group;
      return <div key={t.id}>{heading}<NavItem active={tab === t.id} onClick={() => open({ kind: 'user', tab: t.id })}>{t.label}</NavItem></div>;
    })}>
      {body}
    </Layout>
  );
}

function ServerSettings({ guildId, tab }: { guildId: string; tab: ServerSettingsTab }) {
  const open = useUiStore((s) => s.openSettings);
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const perms = useGuildPermissions(guildId);
  if (!guild) return null;
  const tabs: { id: ServerSettingsTab; label: string; show: boolean }[] = [
    { id: 'overview', label: 'Overview', show: can(perms, Permission.MANAGE_GUILD) },
    { id: 'roles', label: 'Roles', show: can(perms, Permission.MANAGE_ROLES) },
    { id: 'emoji', label: 'Emoji', show: can(perms, Permission.MANAGE_GUILD_EXPRESSIONS) },
    { id: 'members', label: 'Members', show: true },
    { id: 'invites', label: 'Invites', show: can(perms, Permission.MANAGE_GUILD) },
    { id: 'bans', label: 'Bans', show: can(perms, Permission.BAN_MEMBERS) },
    { id: 'audit', label: 'Audit log', show: can(perms, Permission.VIEW_AUDIT_LOG) },
  ];
  const body = { overview: <ServerOverview guildId={guildId} />, roles: <RolesEditor guildId={guildId} />, emoji: <ServerEmoji guildId={guildId} />, members: <ServerMembers guildId={guildId} />, invites: <ServerInvites guildId={guildId} />, bans: <ServerBans guildId={guildId} />, audit: <ServerAudit guildId={guildId} /> }[tab];
  return (
    <Layout title="Server settings" onClose={() => open(null)} nav={<NavGroup title={guild.name}>{tabs.filter((t) => t.show).map((t) => <NavItem key={t.id} active={tab === t.id} onClick={() => open({ kind: 'server', guildId, tab: t.id })}>{t.label}</NavItem>)}</NavGroup>}>
      {body}
    </Layout>
  );
}

export function SettingsHost() {
  const target = useUiStore((s) => s.settings);
  return createPortal(
    <AnimatePresence>
      {target && (
        <motion.div className="settings-layer" initial={{ opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.01 }} transition={gentle}>
          <SettingsRouter target={target} />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function SettingsRouter({ target }: { target: SettingsTarget }) {
  if (target.kind === 'user') return <UserSettings tab={target.tab} />;
  if (target.kind === 'server') return <ServerSettings guildId={target.guildId} tab={target.tab} />;
  return <ChannelSettings channelId={target.channelId} tab={target.tab} />;
}
