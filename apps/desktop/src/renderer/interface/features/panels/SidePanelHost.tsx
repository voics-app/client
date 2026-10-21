import { PushPin, X } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { getRuntime } from '../../app/runtime';
import { gentle } from '../../shared/ui/motion';
import { IconButton } from '../../shared/ui/IconButton';
import { EmptyState } from '../../shared/ui/Misc';
import { MarkdownView } from '../chat/MarkdownView';
import { MemberList } from '../members/MemberList';
import { Avatar } from '../../shared/ui/Avatar';
import { displayName } from '../../shared/hooks/useNames';
import { SearchPanel } from '../search/SearchPanel';
import { ThreadPanel } from './ThreadPanel';
import { WatchPanel } from './WatchPanel';

function PinsPanel({ channelId }: { channelId: string }) {
  const pins = useQuery({ queryKey: ['channel', channelId, 'pins'], queryFn: () => getRuntime().api.pins(channelId) });
  return (
    <div className="panel-body">
      {pins.isLoading && <p className="panel-note">Loading pins</p>}
      {pins.isError && <p className="panel-note">Could not load pins.</p>}
      {pins.data?.length === 0 && <EmptyState icon={<PushPin size={32} weight="light" />} title="No pinned messages" body="Pin important messages so they are easy to find." />}
      <ul className="pin-list">
        {pins.data?.map((m) => (
          <li key={m.id} className="pin-card">
            <header><Avatar id={m.author.id} name={displayName(m.author)} avatar={m.author.avatar} size={22} /><strong>{displayName(m.author)}</strong><time>{new Date(m.timestamp).toLocaleDateString()}</time></header>
            <MarkdownView source={m.content} guildId={m.guild_id} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SidePanelHost() {
  const panel = useUiStore((s) => s.sidePanel);
  const view = useUiStore((s) => s.view);
  const setPanel = useUiStore((s) => s.setSidePanel);
  const channel = useGuildStore((s) => (view.channelId ? s.channels[view.channelId] : undefined));
  const isGuildView = view.kind === 'guild';
  const effective = panel?.kind === 'members' && !isGuildView ? null : panel;
  const title = effective?.kind === 'pins' ? 'Pinned messages' : effective?.kind === 'search' ? 'Search results' : effective?.kind === 'thread' ? 'Thread' : effective?.kind === 'watch' ? 'Watch Together' : null;

  return (
    <AnimatePresence initial={false}>
      {effective && view.channelId && (
        <motion.div key={effective.kind} className="side-panel" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={gentle}>
          {title && (
            <header className="side-panel-head">
              <h2>{title}</h2>
              <IconButton label="Close panel" size="sm" onClick={() => setPanel(null)}><X size={16} /></IconButton>
            </header>
          )}
          {effective.kind === 'members' && isGuildView && <MemberList guildId={view.guildId} />}
          {effective.kind === 'pins' && channel && <PinsPanel channelId={channel.id} />}
          {effective.kind === 'search' && <SearchPanel channelId={view.channelId} />}
          {effective.kind === 'thread' && <ThreadPanel threadId={effective.threadId} />}
          {effective.kind === 'watch' && <WatchPanel channelId={view.channelId} />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
