import { AnimatePresence, motion } from 'framer-motion';
import { MagnifyingGlass, SignOut } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUiStore, type SettingsTarget, type UserSettingsTab } from '@discordy/core/application/stores/uiStore';
import { gentle } from '../../shared/ui/motion';
import { LazyFeature } from '../../shared/ui/LazyFeature';
import { Layout, NavItem, guarded } from './SettingsLayout';

const loadServerSettings = () => import('./server/ServerSettings').then(({ ServerSettings }) => ({ default: ServerSettings }));
import { ChannelSettings } from './channel/ChannelSettings';
import { confirmLogout } from './logout';
import { searchSettings } from './searchIndex';
import { translatedUserTabs } from './userTabs';
import { useI18n } from '../../shared/i18n';
import { LanguageTab } from './user/LanguageTab';
import { AuthorizedApps } from '../integrations/AuthorizedApps';
import { DeveloperTab } from './user/DeveloperTab';
import { AboutTab, AccessibilityTab, AccountTab, AdvancedTab, ChatTab, DesktopTab, AppearanceTab, ConnectionTab, DevicesTab, KeybindsTab, NotificationsTab, PrivacyTab, ProfileTab, VoiceTab } from './user/UserTabs';

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
  const { t, locale } = useI18n();
  const open = useUiStore((s) => s.openSettings);
  const [query, setQuery] = useState('');
  const hits = useMemo(() => searchSettings(query, undefined, 12, locale), [query, locale]);
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
        <input type="search" aria-label={t('settings.search')} placeholder={t('common.search')} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go(0); if (e.key === 'Escape' && query) { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setQuery(''); } }} />
      </label>
      {query.trim() && (
        <ul className="settings-search-results" aria-label={t('settings.results')}>
          {hits.map((h, i) => <li key={`${h.tab}-${h.rowId ?? 'tab'}`}><button type="button" className="settings-item" onClick={() => go(i)}><span>{h.label}</span>{h.rowId && <small className="settings-hit-tab">{h.tabLabel}</small>}</button></li>)}
          {hits.length === 0 && <li className="pick-empty">{t('settings.noMatches')}</li>}
        </ul>
      )}
    </div>
  );
}

function UserSettings({ tab, profileGuildId }: { tab: UserSettingsTab; profileGuildId?: string }) {
  const intl = useI18n();
  const { t } = intl;
  const open = useUiStore((s) => s.openSettings);
  let lastGroup = '';
  const body = { account: <AccountTab />, profile: <ProfileTab key={profileGuildId ?? 'global'} initialGuildId={profileGuildId} />, privacy: <PrivacyTab />, devices: <DevicesTab />, voice: <VoiceTab />, keybinds: <KeybindsTab />, appearance: <AppearanceTab />, accessibility: <AccessibilityTab />, language: <LanguageTab />, notifications: <NotificationsTab />, chat: <ChatTab />, connection: <ConnectionTab />, desktop: <DesktopTab />, advanced: <AdvancedTab />, developer: <DeveloperTab />, authorizedApps: <AuthorizedApps />, about: <AboutTab /> }[tab];
  return (
    <Layout
      title={t('settings.user')}
      nav={<><SettingsSearch tab={tab} />{translatedUserTabs(intl).map((t) => {
        const heading = t.group !== lastGroup ? <h3 key={`h-${t.group}`}>{t.group}</h3> : null;
        lastGroup = t.group;
        return <div key={t.id}>{heading}<NavItem active={tab === t.id} onClick={guarded(() => open({ kind: 'user', tab: t.id }))}>{t.label}</NavItem></div>;
      })}</>}
      footer={<div className="settings-group settings-logout"><NavItem active={false} danger onClick={confirmLogout}><SignOut size={15} /> {t('settings.logout')}</NavItem></div>}
    >
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
  if (target.kind === 'server') return <LazyFeature load={loadServerSettings} props={target} close={() => useUiStore.getState().openSettings(null)} />;
  return <ChannelSettings channelId={target.channelId} tab={target.tab} />;
}
