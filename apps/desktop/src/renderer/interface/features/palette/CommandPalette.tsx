import { useI18n } from '../../shared/i18n';
import { useChannelContentAccess } from '../../shared/hooks/useChannelContentAccess';
import { At, Gear, Hash, House, MagnifyingGlass, Microphone, Moon, Plus, SpeakerHigh, Sun, UsersThree } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { useReadStateStore } from '@discordy/core/application/stores/peopleStores';
import { useNotificationSettingsStore } from '@discordy/core/application/stores/notificationSettingsStore';
import { isChannelMutedDeep, scopeKey } from '@discordy/core/domain/notificationSettings';
import { isUnread } from '@discordy/core/domain/unread';
import { channelSwitcherItem, isSwitchable, MODE_LABELS, rankItems, recentChannelIds, type SwitcherItem } from '@discordy/core/domain/quickSwitcher';
import { isVoiceChannel, openChannel, openGuild } from '../../app/navigation';
import { openVoiceChannel, toggleDeafen, toggleMute } from '../../app/voiceActions';
import { displayName } from '../../shared/hooks/useNames';
import { snappy } from '../../shared/ui/motion';

interface Item extends SwitcherItem {
  group: string;
  icon: ReactNode;
  run: () => void;
}

/**
 * Ctrl+K palette: jump to any channel, DM or server, toggle voice, change theme, open settings.
 * Prefixes narrow the search (`@` people, `#` text channels, `!` voice channels, `*` servers, `*server channel`);
 * an empty query lists recently visited channels first, then unread ones.
 */
export function CommandPalette() {
  const { t: msg, catalogText } = useI18n();
  const open = useUiStore((s) => s.paletteOpen);
  const { visible } = useChannelContentAccess();
  const setOpen = useUiStore((s) => s.openPalette);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const channels = useGuildStore((s) => s.channels);
  const guilds = useGuildStore((s) => s.guilds);
  const theme = usePrefsStore((s) => s.theme);
  const history = useUiStore((s) => s.history);
  const reads = useReadStateStore((s) => s.byChannel);
  const notif = useNotificationSettingsStore((s) => s.byScope);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    if (!open) return [];
    const ui = useUiStore.getState();
    const base: Item[] = [
      { id: 'home', kind: 'action', group: msg("settings.commandpalette.go.to"), label: msg("friends.title"), icon: <UsersThree size={18} />, run: () => ui.navigate({ kind: 'home', channelId: null }), keywords: 'home direct' },
      { id: 'mute', kind: 'action', group: msg("keybind.label.voice"), label: msg("keybind.label.toggle.mute"), icon: <Microphone size={18} />, run: () => void toggleMute(), hint: 'Ctrl+Shift+M' },
      { id: 'deafen', kind: 'action', group: msg("keybind.label.voice"), label: msg("keybind.label.toggle.deafen"), icon: <SpeakerHigh size={18} />, run: () => void toggleDeafen(), hint: 'Ctrl+Shift+D' },
      { id: 'newguild', kind: 'action', group: msg("settings.commandpalette.actions"), label: msg("settings.serverrail.create.a.server"), icon: <Plus size={18} />, run: () => ui.openDialog({ kind: 'createGuild' }) },
      { id: 'joinguild', kind: 'action', group: msg("settings.commandpalette.actions"), label: msg("settings.dialoghost.join.a.server"), icon: <Plus size={18} />, run: () => ui.openDialog({ kind: 'joinGuild' }) },
      { id: 'newdm', kind: 'action', group: msg("settings.commandpalette.actions"), label: msg("home.newMessage"), icon: <At size={18} />, run: () => ui.openDialog({ kind: 'newDm' }) },
      { id: 'settings', kind: 'action', group: msg("settings.commandpalette.settings"), label: msg("settings.user"), icon: <Gear size={18} />, run: () => ui.openSettings({ kind: 'user', tab: 'account' }) },
      { id: 'privacy', kind: 'action', group: msg("settings.commandpalette.settings"), label: msg("settings.commandpalette.privacy.and.delivery.modes"), icon: <Gear size={18} />, run: () => ui.openSettings({ kind: 'user', tab: 'privacy' }) },
      { id: 'voice', kind: 'action', group: msg("settings.commandpalette.settings"), label: msg("settings.commandpalette.voice.and.video.settings"), icon: <Gear size={18} />, run: () => ui.openSettings({ kind: 'user', tab: 'voice' }) },
      { id: 'theme', kind: 'action', group: msg("settings.appearance"), label: theme === 'light' ? msg("settings.commandpalette.switch.to.dark.theme") : msg("settings.commandpalette.switch.to.light.theme"), icon: theme === 'light' ? <Moon size={18} /> : <Sun size={18} />, run: () => usePrefsStore.getState().set('theme', theme === 'light' ? 'dark' : 'light') },
      { id: 'oled', kind: 'action', group: msg("settings.appearance"), label: msg("settings.commandpalette.switch.to.oled.theme"), icon: <Moon size={18} />, run: () => usePrefsStore.getState().set('theme', 'oled') },
    ];
    const guildItems: Item[] = Object.values(guilds).map((g) => ({ id: `g-${g.id}`, kind: 'guild', group: msg("settings.serverrail.servers"), label: g.name, icon: <House size={18} />, run: () => openGuild(g.id) }));
    const recents = recentChannelIds(history.entries);
    const channelItems: Item[] = Object.values(channels)
      .filter(isSwitchable)
      .filter((channel) => visible(channel.id))
      .map((c): Item => {
        const dm = !c.guild_id;
        const voice = isVoiceChannel(c);
        const read = reads[c.id];
        const item = channelSwitcherItem(c, {
          name: dm ? (c.name || (c.recipients ?? []).map((u) => displayName(u)).join(', ') || 'DM') : (c.name ?? ''),
          guildName: c.guild_id ? guilds[c.guild_id]?.name : undefined,
          unread: !isChannelMutedDeep(notif[scopeKey(c.guild_id)], c, Date.now()) && isUnread(c.last_message_id, read?.lastReadId),
          mentions: read?.mentionCount ?? 0,
          recent: recents.indexOf(c.id),
        });
        return {
          ...item,
          group: dm ? msg("home.directMessages") : msg("settings.createguilddialog.channels"),
          icon: dm ? <At size={18} /> : voice ? <SpeakerHigh size={18} /> : <Hash size={18} />,
          run: () => (voice ? void openVoiceChannel(c.guild_id ?? null, c.id) : openChannel(c.id)),
        };
      });
    // English action words remain searchable after switching the UI language.
    const aliases: Record<string, string> = { home: 'Friends home direct', mute: 'Toggle mute', deafen: 'Toggle deafen', newguild: 'Create a server', joinguild: 'Join a server', newdm: 'New message', settings: 'User settings', privacy: 'Privacy and delivery modes', voice: 'Voice and video settings', theme: 'Switch dark light theme', oled: 'Switch to OLED theme' };
    return [...channelItems, ...guildItems, ...base.map((item) => ({ ...item, keywords: [item.keywords, aliases[item.id]].filter(Boolean).join(' ') }))];
  }, [open, channels, guilds, theme, history, reads, notif, msg, visible]);

  const ranked = useMemo(() => rankItems(items, query), [items, query]);
  const results = ranked.items;

  useEffect(() => setIndex(0), [query]);
  useEffect(() => listRef.current?.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }), [index]);

  const choose = (item: Item | undefined) => {
    if (!item) return;
    setOpen(false);
    item.run();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="modal-layer palette-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
          <div className="modal-scrim" onMouseDown={() => setOpen(false)} />
          <motion.div className="palette glass" role="dialog" aria-label={msg("settings.commandpalette.command.palette")} initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={snappy}>
            <label className="palette-input">
              <MagnifyingGlass size={18} />
              {ranked.mode !== 'all' && <span className="palette-mode" aria-label={msg('palette.searching', { mode: catalogText(MODE_LABELS[ranked.mode]) })}>{catalogText(MODE_LABELS[ranked.mode])}</span>}
              <input
                autoFocus
                value={query}
                placeholder={msg("settings.commandpalette.jump.to.a.channel.person.or.action.people.text")}
                aria-label={msg("settings.commandpalette.command.palette.search")}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(results.length - 1, i + 1)); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
                  else if (e.key === 'Enter') { e.preventDefault(); choose(results[index]); }
                  else if (e.key === 'Escape') setOpen(false);
                }}
              />
            </label>
            <ul ref={listRef} role="listbox" className="palette-list">
              {results.map((item, i) => (
                <li key={item.id} role="option" aria-selected={i === index}>
                  {(i === 0 || results[i - 1]!.group !== item.group) && <p className="palette-group">{item.group}</p>}
                  <button type="button" className={i === index ? 'is-selected' : ''} onMouseMove={() => setIndex(i)} onClick={() => choose(item)}>
                    <span className="palette-icon">{item.icon}</span>
                    <span className="palette-label">{item.label}</span>
                    {item.hint && <span className="palette-hint">{item.hint}</span>}
                  </button>
                </li>
              ))}
              {results.length === 0 && <li className="palette-none">{msg('palette.noMatch', { query })}</li>}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
