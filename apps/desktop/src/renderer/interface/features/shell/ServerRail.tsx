import { motion } from 'framer-motion';
import { Compass, House, Plus } from '@phosphor-icons/react';
import { useMemo, useRef, useState } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useReadStateStore } from '@renderer/application/stores/peopleStores';
import { usePrefsStore } from '@renderer/application/stores/prefsStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { useVoiceStore } from '@renderer/application/stores/voiceStore';
import { isUnread } from '@renderer/domain/unread';
import { ChannelType } from '@shared/contracts/rest';
import { openGuild } from '../../app/navigation';
import { useConnectionStore } from '../../app/connectionStore';
import { assetCandidates } from '@renderer/domain/assets';
import { AssetImage } from '../../shared/ui/AssetImage';
import { initialsOf } from '../../shared/ui/Avatar';
import { Count } from '../../shared/ui/Misc';
import { Tooltip } from '../../shared/ui/Tooltip';
import { snappy } from '../../shared/ui/motion';
import { useRovingFocus } from '../../shared/hooks/useRovingFocus';
import { GuildContextMenu } from '../channels/GuildMenu';

export function useGuildActivity(guildId: string): { unread: boolean; mentions: number } {
  const channels = useGuildStore((s) => s.channels);
  const reads = useReadStateStore((s) => s.byChannel);
  const muted = usePrefsStore((s) => s.mutedChannels);
  return useMemo(() => {
    let unread = false;
    let mentions = 0;
    for (const c of Object.values(channels)) {
      if (c.guild_id !== guildId || c.type !== ChannelType.GUILD_TEXT) continue;
      const r = reads[c.id];
      mentions += r?.mentionCount ?? 0;
      if (!muted[c.id] && isUnread(c.last_message_id, r?.lastReadId)) unread = true;
    }
    return { unread, mentions };
  }, [channels, reads, muted, guildId]);
}

function GuildButton({ guildId, active, onDragStart, onDrop }: { guildId: string; active: boolean; onDragStart: () => void; onDrop: () => void }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const cdn = useConnectionStore((s) => s.cdnUrl);
  const { unread, mentions } = useGuildActivity(guildId);
  const inCall = useVoiceStore((s) => s.call.guildId === guildId && s.call.status !== 'idle');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  if (!guild) return null;
  return (
    <div className="rail-item" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <span className={`rail-pip${unread && !active ? ' is-unread' : ''}`} />
      {active && <motion.span layoutId="rail-pill" className="rail-pill" transition={snappy} />}
      <Tooltip label={guild.name} side="right" delay={150}>
        <button
          type="button"
          draggable
          onDragStart={onDragStart}
          className={`guild-btn${active ? ' is-active' : ''}`}
          aria-label={guild.name}
          aria-current={active || undefined}
          onClick={() => openGuild(guildId)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY });
          }}
        >
          {guild.icon ? <AssetImage candidates={assetCandidates(cdn, 'icons', guild.id, guild.icon)} /> : <span>{initialsOf(guild.name).slice(0, 3)}</span>}
        </button>
      </Tooltip>
      {mentions > 0 && (
        <span className="rail-badge">
          <Count value={mentions} tone="danger" />
        </span>
      )}
      {inCall && <span className="rail-call" role="img" aria-label="In a call here" />}
      <GuildContextMenu guildId={guildId} anchor={menu} onClose={() => setMenu(null)} />
    </div>
  );
}

export function ServerRail() {
  const order = useGuildStore((s) => s.order);
  const move = useGuildStore((s) => s.moveGuild);
  const view = useUiStore((s) => s.view);
  const navigate = useUiStore((s) => s.navigate);
  const openDialog = useUiStore((s) => s.openDialog);
  const channels = useGuildStore((s) => s.channels);
  const reads = useReadStateStore((s) => s.byChannel);
  const [dragged, setDragged] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  useRovingFocus(navRef, { selector: '.guild-btn' });
  const dmMentions = useMemo(
    () => Object.values(channels).filter((c) => !c.guild_id).reduce((sum, c) => sum + (reads[c.id]?.mentionCount ?? 0), 0),
    [channels, reads],
  );
  const homeActive = view.kind === 'home';

  return (
    <nav ref={navRef} className="rail" aria-label="Servers">
      <div className="rail-item">
        {homeActive && <motion.span layoutId="rail-pill" className="rail-pill" transition={snappy} />}
        <Tooltip label="Direct messages" side="right" delay={150}>
          <button
            type="button"
            className={`guild-btn home-btn${homeActive ? ' is-active' : ''}`}
            aria-label="Direct messages"
            aria-current={homeActive || undefined}
            onClick={() => navigate({ kind: 'home', channelId: null })}
          >
            <House size={24} weight={homeActive ? 'fill' : 'regular'} />
          </button>
        </Tooltip>
        {dmMentions > 0 && (
          <span className="rail-badge">
            <Count value={dmMentions} tone="danger" />
          </span>
        )}
      </div>
      <div className="rail-sep" />
      <div className="rail-scroll">
        {order.map((id, index) => (
          <GuildButton
            key={id}
            guildId={id}
            active={view.kind === 'guild' && view.guildId === id}
            onDragStart={() => setDragged(id)}
            onDrop={() => {
              if (dragged && dragged !== id) move(dragged, index);
              setDragged(null);
            }}
          />
        ))}
        <div className="rail-item">
          <Tooltip label="Create a server" side="right" delay={150}>
            <button type="button" className="guild-btn add-btn" aria-label="Create a server" onClick={() => openDialog({ kind: 'createGuild' })}>
              <Plus size={22} />
            </button>
          </Tooltip>
        </div>
        <div className="rail-item">
          <Tooltip label="Join a server" side="right" delay={150}>
            <button type="button" className="guild-btn add-btn" aria-label="Join a server" onClick={() => openDialog({ kind: 'joinGuild' })}>
              <Compass size={22} />
            </button>
          </Tooltip>
        </div>
      </div>
    </nav>
  );
}
