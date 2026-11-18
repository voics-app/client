import { AnimatePresence, motion } from 'framer-motion';
import { MagnifyingGlass, SignOut } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { confirmDeleteServer } from './server/deleteServer';
import { useUiStore, type ServerSettingsTab, type SettingsTarget, type UserSettingsTab } from '@discordy/core/application/stores/uiStore';
import { serverSettingsTabs } from '@discordy/core/domain/serverSettings';
import { useGuildPermissions } from '../../shared/hooks/usePermissions';
import { useDialogFocus } from '../../shared/hooks/useDialogFocus';
import { gentle } from '../../shared/ui/motion';
import { SettingsCloseButton } from './SettingsCloseButton';
import { ChannelSettings } from './channel/ChannelSettings';
import { ServerDiscovery } from './server/ServerDiscovery';
import { ServerTemplate } from './server/ServerTemplate';
import { ServerAudit, ServerBans, ServerEmoji, ServerInvites, ServerMembers } from './server/ServerTabs';
import { ServerOverview } from './server/ServerOverview';
import { RolesEditor } from './server/RolesEditor';
import { closeSettings, useUnsavedStore } from '@discordy/core/application/stores/unsavedStore';
import { confirmLogout } from './logout';
import { searchSettings } from './searchIndex';
import { USER_TABS } from './userTabs';
import { DeveloperTab } from './user/DeveloperTab';
import { AboutTab, AccessibilityTab, AccountTab, AdvancedTab, ChatTab, DesktopTab, AppearanceTab, ConnectionTab, DevicesTab, KeybindsTab, NotificationsTab, PrivacyTab, ProfileTab, VoiceTab } from './user/UserTabs';

function Layout({ title, nav, children, footer }: { title: string; nav: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref);
  useEffect(() => {
    // Dialogs and menus opened on top of settings stop Escape in the capture phase, so only a bare Escape arrives here.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeSettings(true);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div ref={ref} tabIndex={-1} className="settings" role="dialog" aria-modal="true" aria-label={title}>
      <nav className="settings-nav">{nav}{footer}</nav>
      <div className="settings-content">
        <div className="settings-inner">{children}</div>
        <SettingsCloseButton onClose={() => closeSettings()} />
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

/** Switches tab unless the current page holds unsaved edits, in which case the bar shakes instead. */
const guarded = (go: () => void) => () => { if (useUnsavedStore.getState().requestLeave()) go(); };

/** Scrolls to a row after its tab has rendered and flashes it. Retries for a few frames while the tab mounts. */
function revealRow(rowId: string, tries = 20): void {
  const el = document.querySelector<HTMLElement>(`.settings-inner [data-row="${rowId}"]`);
  if (!el) {
    if (tries > 0) requestAnimationFrame(() => revealRow(rowId, tries - 1));
    return;
  }
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.remove('is-found');
  void el.offsetWidth;
  el.classList.add('is-found');
  window.setTimeout(() => el.classList.remove('is-found'), 2000);
}

function SettingsSearch({ tab }: { tab: UserSettingsTab }) {
  const open = useUiStore((s) => s.openSettings);
  const [query, setQuery] = useState('');
  const hits = useMemo(() => searchSettings(query), [query]);
  const go = (i: number) => {
    const hit = hits[i];
    if (!hit) return;
    guarded(() => {
      if (hit.tab !== tab) open({ kind: 'user', tab: hit.tab });
      if (hit.rowId) revealRow(hit.rowId);
      setQuery('');
    })();
  };
  return (
    <div className="settings-search">
      <label className="settings-search-field">
        <MagnifyingGlass size={14} aria-hidden="true" />
        <input type="search" aria-label="Search settings" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go(0); if (e.key === 'Escape' && query) { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setQuery(''); } }} />
      </label>
      {query.trim() && (
        <ul className="settings-search-results" aria-label="Search results">
          {hits.map((h, i) => <li key={`${h.tab}-${h.rowId ?? 'tab'}`}><button type="button" className="settings-item" onClick={() => go(i)}><span>{h.label}</span>{h.rowId && <small className="settings-hit-tab">{h.tabLabel}</small>}</button></li>)}
          {hits.length === 0 && <li className="pick-empty">No settings match.</li>}
        </ul>
      )}
    </div>
  );
}

function UserSettings({ tab, profileGuildId }: { tab: UserSettingsTab; profileGuildId?: string }) {
  const open = useUiStore((s) => s.openSettings);
  let lastGroup = '';
  const body = { account: <AccountTab />, profile: <ProfileTab key={profileGuildId ?? 'global'} initialGuildId={profileGuildId} />, privacy: <PrivacyTab />, devices: <DevicesTab />, voice: <VoiceTab />, keybinds: <KeybindsTab />, appearance: <AppearanceTab />, accessibility: <AccessibilityTab />, notifications: <NotificationsTab />, chat: <ChatTab />, connection: <ConnectionTab />, desktop: <DesktopTab />, advanced: <AdvancedTab />, developer: <DeveloperTab />, about: <AboutTab /> }[tab];
  return (
    <Layout
      title="User settings"
      nav={<><SettingsSearch tab={tab} />{USER_TABS.map((t) => {
        const heading = t.group !== lastGroup ? <h3 key={`h-${t.group}`}>{t.group}</h3> : null;
        lastGroup = t.group;
        return <div key={t.id}>{heading}<NavItem active={tab === t.id} onClick={guarded(() => open({ kind: 'user', tab: t.id }))}>{t.label}</NavItem></div>;
      })}</>}
      footer={<div className="settings-group settings-logout"><NavItem active={false} danger onClick={confirmLogout}><SignOut size={15} /> Log out</NavItem></div>}
    >
      {body}
    </Layout>
  );
}

function ServerSettings({ guildId, tab }: { guildId: string; tab: ServerSettingsTab }) {
  const open = useUiStore((s) => s.openSettings);
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const me = useSessionStore((s) => s.user?.id);
  const perms = useGuildPermissions(guildId);
  if (!guild) return null;
  const tabs = serverSettingsTabs(perms).filter((entry) => entry.show);
  const selectedTab = tabs.find((entry) => entry.id === tab)?.id ?? tabs[0]?.id ?? 'members';
  const body = { overview: <ServerOverview guildId={guildId} />, roles: <RolesEditor guildId={guildId} />, emoji: <ServerEmoji guildId={guildId} />, members: <ServerMembers guildId={guildId} />, invites: <ServerInvites guildId={guildId} />, template: <ServerTemplate guildId={guildId} />, discovery: <ServerDiscovery guildId={guildId} />, bans: <ServerBans guildId={guildId} />, audit: <ServerAudit guildId={guildId} /> }[selectedTab];
  return (
    <Layout title="Server settings" nav={<>{(['Server', 'People', 'Moderation'] as const).map((group) => {
      const entries = tabs.filter((entry) => entry.group === group);
      return entries.length > 0 && <NavGroup key={group} title={group === 'Server' ? guild.name : group}>{entries.map((entry) => <NavItem key={entry.id} active={selectedTab === entry.id} onClick={guarded(() => open({ kind: 'server', guildId, tab: entry.id }))}>{entry.label}</NavItem>)}</NavGroup>;
    })}</>} footer={guild.owner_id === me ? <div className="settings-group settings-logout"><NavItem active={false} danger onClick={guarded(() => confirmDeleteServer(guildId))}>Delete server</NavItem></div> : undefined}>
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
  if (target.kind === 'user') return <UserSettings tab={target.tab} profileGuildId={target.profileGuildId} />;
  if (target.kind === 'server') return <ServerSettings guildId={target.guildId} tab={target.tab} />;
  return <ChannelSettings channelId={target.channelId} tab={target.tab} />;
}
