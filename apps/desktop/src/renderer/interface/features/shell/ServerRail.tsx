import { useI18n } from '../../shared/i18n';
import { motion } from 'framer-motion';
import { BellRinging, BellSlash, Check, Compass, FolderSimple, FolderSimpleDashed, Gear, House, LinkSimple, Plus } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useReadStateStore } from '@discordy/core/application/stores/peopleStores';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { useVoiceStore } from '@discordy/core/application/stores/voiceStore';
import { isUnread } from '@discordy/core/domain/unread';
import { applyDrop, folderLabel, moveGuildToIndex, ungroup, type DragItem, type DropZone } from '@discordy/core/domain/railLayout';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { ChannelType, type GuildFolder, type GuildNotificationSettings } from '@discordy/core/contracts/rest';
import { openGuild } from '../../app/navigation';
import { useConnectionStore } from '../../app/connectionStore';
import { assetCandidates } from '@discordy/core/domain/assets';
import { AssetImage } from '../../shared/ui/AssetImage';
import { DM_SCOPE, isChannelMuted, isChannelMutedDeep, isGuildMuted, MUTE_DURATIONS, scopeKey } from '@discordy/core/domain/notificationSettings';
import { useNow } from '../../shared/hooks/useNow';
import { useNotificationSettingsStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { Avatar, initialsOf } from '../../shared/ui/Avatar';
import { displayName } from '../../shared/hooks/useNames';
import { MAX_RAIL_DMS, unreadDms, type UnreadDm } from '@discordy/core/domain/unreadDms';
import { Count } from '../../shared/ui/Misc';
import { Tooltip } from '../../shared/ui/Tooltip';
import { snappy } from '../../shared/ui/motion';
import { useRovingFocus } from '../../shared/hooks/useRovingFocus';
import { GuildContextMenu } from '../channels/GuildMenu';
import { markGuildRead, saveRail } from '../../app/actions';
import { muteGuild } from '../../app/notificationActions';
import { Menu, type MenuEntry } from '../../shared/ui/Menu';

type Activity = { unread: boolean; mentions: number };

function computeActivity(
  channels: ReturnType<typeof useGuildStore.getState>['channels'],
  reads: ReturnType<typeof useReadStateStore.getState>['byChannel'],
  settingsFor: (guildId: string) => GuildNotificationSettings | undefined,
  guildIds: ReadonlySet<string>,
  now: number,
): Activity {
  let unread = false;
  let mentions = 0;
  for (const c of Object.values(channels)) {
    if (!c.guild_id || !guildIds.has(c.guild_id) || (c.type !== ChannelType.GUILD_TEXT && c.type !== ChannelType.GUILD_ANNOUNCEMENT && !(c.type >= 10 && c.type <= 12))) continue;
    if (isGuildMuted(settingsFor(c.guild_id), now)) continue;
    const r = reads[c.id];
    mentions += r?.mentionCount ?? 0;
    if (!isChannelMutedDeep(settingsFor(c.guild_id), c, now) && isUnread(c.last_message_id, r?.lastReadId)) unread = true;
  }
  return { unread, mentions };
}

export function useGuildActivity(guildId: string): Activity {
  return useFolderActivity([guildId]);
}

/** Unread and mention totals over a set of servers (a folder's badge). */
export function useFolderActivity(guildIds: string[]): Activity {
  const channels = useGuildStore((s) => s.channels);
  const reads = useReadStateStore((s) => s.byChannel);
  const byScope = useNotificationSettingsStore((s) => s.byScope);
  const key = guildIds.join(',');
  const now = useNow(1000);
  return useMemo(
    () => computeActivity(channels, reads, (id) => byScope[scopeKey(id)], new Set(key ? key.split(',') : []), now),
    [channels, reads, byScope, key, now],
  );
}

interface DndApi {
  drag: DragItem | null;
  hover: { key: string; zone: DropZone } | null;
  begin(item: DragItem): void;
  over(event: React.DragEvent, key: string, allowOnto: boolean): void;
  drop(event: React.DragEvent, target: DragItem): void;
  end(): void;
}

const keyOf = (item: DragItem) => (item.kind === 'guild' ? `g:${item.id}` : `f:${item.id}`);

function zoneFor(event: React.DragEvent, allowOnto: boolean): DropZone {
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = (event.clientY - rect.top) / Math.max(rect.height, 1);
  if (!allowOnto) return ratio < 0.5 ? 'before' : 'after';
  return ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'onto';
}

function dropClass(dnd: DndApi, key: string): string {
  return dnd.hover?.key === key ? ` drop-${dnd.hover.zone}` : '';
}

function GuildButton({ guildId, active, dnd, folderId }: { guildId: string; active: boolean; dnd: DndApi; folderId: number | null }) {
  const { t: msg } = useI18n();
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const cdn = useConnectionStore((s) => s.cdnUrl);
  const { unread, mentions } = useGuildActivity(guildId);
  const inCall = useVoiceStore((s) => s.call.guildId === guildId && s.call.status !== 'idle');
  const settings = useNotificationSettingsStore((s) => s.byScope[scopeKey(guildId)]);
  const now = useNow(1000);
  const muted = isGuildMuted(settings, now);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  if (!guild) return null;
  const item: DragItem = { kind: 'guild', id: guildId };
  const leading = (): MenuEntry[] => {
    const { rail, order } = useGuildStore.getState();
    const index = order.indexOf(guildId);
    return [
      { kind: 'item', label: msg("settings.serverrail.move.up"), disabled: index <= 0, onSelect: () => void saveRail(moveGuildToIndex(rail, guildId, index - 1)) },
      { kind: 'item', label: msg("settings.serverrail.move.down"), disabled: index >= order.length - 1, onSelect: () => void saveRail(moveGuildToIndex(rail, guildId, index + 1)) },
      ...(folderId !== null
        ? [{ kind: 'item' as const, label: msg("settings.serverrail.remove.from.folder"), onSelect: () => void saveRail(applyDrop(rail, item, { kind: 'folder', id: folderId }, 'after')) }]
        : []),
      { kind: 'separator' as const },
    ];
  };
  return (
    <div
      className={`rail-item${folderId !== null ? ' in-folder' : ''}${dnd.drag && keyOf(dnd.drag) === keyOf(item) ? ' is-dragging' : ''}${dropClass(dnd, keyOf(item))}`}
      onDragOver={(e) => dnd.over(e, keyOf(item), true)}
      onDrop={(e) => dnd.drop(e, item)}
    >
      <span className={`rail-pip${unread && !active ? ' is-unread' : ''}`} />
      {active && <motion.span layoutId="rail-pill" className="rail-pill" transition={snappy} />}
      <Tooltip label={guild.name} side="right" delay={150}>
        <button
          type="button"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            dnd.begin(item);
          }}
          onDragEnd={dnd.end}
          className={`guild-btn${active ? ' is-active' : ''}${muted ? ' is-muted' : ''}`}
          aria-keyshortcuts="Alt+Shift+ArrowUp Alt+Shift+ArrowDown"
          onKeyDown={(e) => {
            if (!e.altKey || !e.shiftKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
            e.preventDefault();
            e.stopPropagation();
            const { rail, order } = useGuildStore.getState();
            const index = order.indexOf(guildId);
            const next = index + (e.key === 'ArrowUp' ? -1 : 1);
            if (next < 0 || next >= order.length) return;
            void saveRail(moveGuildToIndex(rail, guildId, next));
          }}
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
      {inCall && <span className="rail-call" role="img" aria-label={msg("settings.serverrail.in.a.call.here")} />}
      <GuildContextMenu guildId={guildId} anchor={menu} onClose={() => setMenu(null)} leading={menu ? leading() : []} />
    </div>
  );
}

const cssColor = (color: number | null) => (color === null ? undefined : `#${color.toString(16).padStart(6, '0')}`);

function FolderBlock({ folder, activeGuildId, dnd }: { folder: GuildFolder; activeGuildId: string | null; dnd: DndApi }) {
  const { t: msg, locale, catalogText } = useI18n();
  const folderId = folder.id as number;
  const collapseKey = `folder-${folderId}`;
  const closed = usePrefsStore((s) => s.collapsedCategories[collapseKey] ?? false);
  const guilds = useGuildStore((s) => s.guilds);
  const cdn = useConnectionStore((s) => s.cdnUrl);
  const activity = useFolderActivity(folder.guild_ids);
  const byScope = useNotificationSettingsStore((s) => s.byScope);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const label = folderLabel(folder, (id) => guilds[id]?.name, locale);
  const item: DragItem = { kind: 'folder', id: folderId };
  const containsActive = activeGuildId !== null && folder.guild_ids.includes(activeGuildId);
  const tint = cssColor(folder.color);

  const entries = (): MenuEntry[] => {
    const allMuted = folder.guild_ids.every((id) => isGuildMuted(byScope[scopeKey(id)], Date.now()));
    return [
      { kind: 'item', label: msg("settings.serverrail.mark.folder.as.read"), icon: <Check size={16} />, onSelect: () => folder.guild_ids.forEach(markGuildRead) },
      allMuted
        ? { kind: 'item', label: msg("settings.serverrail.unmute.folder"), icon: <BellRinging size={16} />, onSelect: () => folder.guild_ids.forEach((id) => void muteGuild(id, undefined)) }
        : {
            kind: 'submenu',
            label: msg("settings.serverrail.mute.folder"),
            icon: <BellSlash size={16} />,
            entries: MUTE_DURATIONS.map((d) => ({ kind: 'item' as const, label: catalogText(d.label), onSelect: () => folder.guild_ids.forEach((id) => void muteGuild(id, d.seconds)) })),
          },
      { kind: 'item', label: msg("settings.foldersettingsdialog.folder.settings"), icon: <Gear size={16} />, onSelect: () => useUiStore.getState().openDialog({ kind: 'folderSettings', folderId }) },
      { kind: 'separator' },
      { kind: 'item', label: msg("settings.serverrail.ungroup.servers"), icon: <FolderSimpleDashed size={16} />, danger: true, onSelect: () => void saveRail(ungroup(useGuildStore.getState().rail, folderId)) },
    ];
  };

  return (
    <div className="rail-folder" style={tint ? ({ '--folder-tint': tint } as React.CSSProperties) : undefined}>
      <div className={`rail-item${dnd.drag && keyOf(dnd.drag) === keyOf(item) ? ' is-dragging' : ''}${dropClass(dnd, keyOf(item))}`} onDragOver={(e) => dnd.over(e, keyOf(item), true)} onDrop={(e) => dnd.drop(e, item)}>
        <span className={`rail-pip${closed && activity.unread && !containsActive ? ' is-unread' : ''}`} />
        <Tooltip label={label} side="right" delay={150}>
          <button
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              dnd.begin(item);
            }}
            onDragEnd={dnd.end}
            className={`guild-btn folder-btn${closed ? ' is-closed' : ' is-open'}`}
            aria-label={`${label} folder`}
            aria-expanded={!closed}
            onClick={() => usePrefsStore.getState().toggleMap('collapsedCategories', collapseKey)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY });
            }}
          >
            {closed ? (
              <span className="folder-grid">
                {folder.guild_ids.slice(0, 4).map((id) => {
                  const g = guilds[id];
                  return g?.icon ? <img key={id} alt="" src={assetCandidates(cdn, 'icons', g.id, g.icon)[0]} /> : <i key={id} />;
                })}
              </span>
            ) : (
              <FolderSimple size={24} weight="fill" />
            )}
          </button>
        </Tooltip>
        {closed && activity.mentions > 0 && (
          <span className="rail-badge">
            <Count value={activity.mentions} tone="danger" />
          </span>
        )}
        <Menu open={menu !== null} x={menu?.x ?? 0} y={menu?.y ?? 0} entries={menu ? entries() : []} onClose={() => setMenu(null)} minWidth={200} />
      </div>
      {!closed && (
        <div className="folder-children">
          {folder.guild_ids.map((id) => (
            <GuildButton key={id} guildId={id} active={activeGuildId === id} dnd={dnd} folderId={folderId} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A conversation with unread messages, above the servers: the person's avatar with the number of new messages. */
function UnreadDmItem({ dm }: { dm: UnreadDm }) {
  const navigate = useUiStore((s) => s.navigate);
  const recipients = dm.channel.recipients ?? [];
  const name = dm.channel.name || recipients.map((u) => displayName(u)).join(', ') || 'Unknown';
  const peer = recipients.length === 1 ? recipients[0]! : null;
  return (
    <div className="rail-item">
      <Tooltip label={name} side="right" delay={150}>
        <button type="button" className="guild-btn" aria-label={`${name}, ${dm.count} unread`} onClick={() => navigate({ kind: 'home', channelId: dm.channel.id })}>
          <Avatar id={peer?.id ?? dm.channel.id} name={name} avatar={peer?.avatar ?? null} size={48} />
        </button>
      </Tooltip>
      <span className="rail-badge">
        <Count value={dm.count} tone="danger" />
      </span>
    </div>
  );
}

function useRailDnd(scrollRef: RefObject<HTMLDivElement | null>): DndApi {
  const [drag, setDrag] = useState<DragItem | null>(null);
  const [hover, setHover] = useState<{ key: string; zone: DropZone } | null>(null);
  // Native dragover events continue while the pointer is stationary near an edge.
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!drag || !scroll) return;
    const autoScroll = (event: DragEvent) => {
      const box = scroll.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right) return;
      const edge = 36;
      const delta = event.clientY < box.top + edge ? -16 : event.clientY > box.bottom - edge ? 16 : 0;
      if (delta) scroll.scrollTop += delta;
    };
    scroll.addEventListener('dragover', autoScroll);
    return () => scroll.removeEventListener('dragover', autoScroll);
  }, [drag, scrollRef]);
  const end = () => {
    setDrag(null);
    setHover(null);
  };
  return {
    drag,
    hover,
    begin: setDrag,
    end,
    over(event, key, allowOnto) {
      if (!drag) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const zone = zoneFor(event, allowOnto);
      setHover((h) => (h?.key === key && h.zone === zone ? h : { key, zone }));
    },
    drop(event, target) {
      event.preventDefault();
      if (drag && hover) void saveRail(applyDrop(useGuildStore.getState().rail, drag, target, hover.zone));
      end();
    },
  };
}

export function ServerRail() {
  const { t: msg } = useI18n();
  const rail = useGuildStore((s) => s.rail);
  const view = useUiStore((s) => s.view);
  const navigate = useUiStore((s) => s.navigate);
  const openDialog = useUiStore((s) => s.openDialog);
  const channels = useGuildStore((s) => s.channels);
  const reads = useReadStateStore((s) => s.byChannel);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dnd = useRailDnd(scrollRef);
  const navRef = useRef<HTMLElement>(null);
  useRovingFocus(navRef, { selector: '.guild-btn' });
  const dmSettings = useNotificationSettingsStore((s) => s.byScope[DM_SCOPE]);
  const now = useNow(1000);
  const allUnreadDms = useMemo(() => unreadDms(channels, reads, (c) => isChannelMuted(dmSettings, c.id, now), Infinity), [channels, reads, dmSettings, now]);
  const dms = allUnreadDms.slice(0, MAX_RAIL_DMS);
  const homeActive = view.kind === 'home';
  const activeGuildId = view.kind === 'guild' ? view.guildId : null;

  return (
    <nav ref={navRef} className="rail" aria-label={msg("settings.serverrail.servers")}>
      <div className="rail-item">
        {homeActive && <motion.span layoutId="rail-pill" className="rail-pill" transition={snappy} />}
        <Tooltip label={msg("home.directMessages")} side="right" delay={150}>
          <button
            type="button"
            className={`guild-btn home-btn${homeActive ? ' is-active' : ''}`}
            aria-label={msg("home.directMessages")}
            aria-current={homeActive || undefined}
            onClick={() => navigate({ kind: 'home', channelId: null })}
          >
            <House size={24} weight={homeActive ? 'fill' : 'regular'} />
          </button>
        </Tooltip>
        {allUnreadDms.length > 0 && (
          <span className="rail-badge">
            <Count value={allUnreadDms.length} tone="danger" />
          </span>
        )}
      </div>
      {dms.map((dm) => (
        <UnreadDmItem key={dm.channel.id} dm={dm} />
      ))}
      <div className="rail-sep" />
      <div ref={scrollRef} className="rail-scroll">
        {rail.map((entry) =>
          entry.id === null ? (
            <GuildButton key={entry.guild_ids[0]} guildId={entry.guild_ids[0]!} active={activeGuildId === entry.guild_ids[0]} dnd={dnd} folderId={null} />
          ) : (
            <FolderBlock key={`folder-${entry.id}`} folder={entry} activeGuildId={activeGuildId} dnd={dnd} />
          ),
        )}
        <div className="rail-item">
          <Tooltip label={msg("settings.serverrail.create.a.server")} side="right" delay={150}>
            <button type="button" className="guild-btn add-btn" aria-label={msg("settings.serverrail.create.a.server")} onClick={() => openDialog({ kind: 'createGuild' })}>
              <Plus size={22} />
            </button>
          </Tooltip>
        </div>
        <div className="rail-item">
          <Tooltip label={msg("settings.dialoghost.join.a.server")} side="right" delay={150}>
            <button type="button" className="guild-btn add-btn" aria-label={msg("settings.dialoghost.join.a.server")} onClick={() => openDialog({ kind: 'joinGuild' })}>
              <LinkSimple size={22} />
            </button>
          </Tooltip>
        </div>
        <div className="rail-item">
          {view.kind === 'discover' && <motion.span layoutId="rail-pill" className="rail-pill" transition={snappy} />}
          <Tooltip label={msg("settings.serverrail.discover.servers")} side="right" delay={150}>
            <button type="button" className={`guild-btn add-btn${view.kind === 'discover' ? ' is-active' : ''}`} aria-label={msg("settings.serverrail.discover.servers")} aria-current={view.kind === 'discover' || undefined} onClick={() => navigate({ kind: 'discover', channelId: null })}>
              <Compass size={22} />
            </button>
          </Tooltip>
        </div>
      </div>
    </nav>
  );
}
