import { useI18n } from '../../shared/i18n';
import { X } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { gentle } from '../../shared/ui/motion';
import { IconButton } from '../../shared/ui/IconButton';
import { MemberList } from '../members/MemberList';
import { SearchPanel } from '../search/SearchPanel';
import { DmProfilePanel } from './DmProfilePanel';
import { PinsPanel } from './PinsPanel';
import { ThreadPanel } from './ThreadPanel';
import { WatchPanel } from './WatchPanel';
import { AgeRestrictedGate } from '../channels/AgeRestrictedGate';

export function SidePanelHost() {
  const { t: msg } = useI18n();
  const panel = useUiStore((s) => s.sidePanel);
  const view = useUiStore((s) => s.view);
  const setPanel = useUiStore((s) => s.setSidePanel);
  const channel = useGuildStore((s) => (view.channelId ? s.channels[view.channelId] : undefined));
  const isGuildView = view.kind === 'guild';
  const effective = panel?.kind === 'members' && !isGuildView ? null : panel;
  const title = effective?.kind === 'pins' ? msg("header.pins") : effective?.kind === 'search' ? msg("settings.results") : effective?.kind === 'thread' ? msg("settings.sidepanelhost.thread") : effective?.kind === 'watch' ? msg("header.watch") : effective?.kind === 'profile' ? msg("settings.profile") : null;

  return (
    <AnimatePresence initial={false}>
      {effective && view.channelId && (
        <motion.div key={effective.kind} className="side-panel" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={gentle}>
          {title && (
            <header className="side-panel-head">
              <h2>{title}</h2>
              <IconButton label={msg("settings.sidepanelhost.close.panel")} size="sm" onClick={() => setPanel(null)}><X size={16} /></IconButton>
            </header>
          )}
          <AgeRestrictedGate channelId={effective.kind === 'thread' ? effective.threadId : view.channelId}>
          {effective.kind === 'members' && isGuildView && <MemberList guildId={view.guildId} />}
          {effective.kind === 'pins' && channel && <PinsPanel channelId={channel.id} />}
          {effective.kind === 'search' && <SearchPanel channelId={view.channelId} />}
          {effective.kind === 'thread' && <ThreadPanel threadId={effective.threadId} />}
          {effective.kind === 'watch' && <WatchPanel channelId={view.channelId} />}
          {effective.kind === 'profile' && channel && <DmProfilePanel channelId={channel.id} />}
          </AgeRestrictedGate>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
