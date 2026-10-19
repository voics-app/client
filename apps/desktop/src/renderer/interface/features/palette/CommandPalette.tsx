import { At, Gear, Hash, House, MagnifyingGlass, Microphone, Moon, Plus, SpeakerHigh, Sun, UsersThree } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { usePrefsStore } from '@renderer/application/stores/prefsStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { ChannelType } from '@shared/contracts/rest';
import { isVoiceChannel, openChannel, openGuild } from '../../app/navigation';
import { openVoiceChannel, toggleDeafen, toggleMute } from '../../app/voiceActions';
import { displayName } from '../../shared/hooks/useNames';
import { snappy } from '../../shared/ui/motion';

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
  keywords?: string;
}

function score(query: string, item: Item): number {
  const hay = `${item.label} ${item.hint ?? ''} ${item.keywords ?? ''}`.toLowerCase();
  if (!query) return 1;
  const q = query.toLowerCase();
  if (item.label.toLowerCase().startsWith(q)) return 100;
  if (hay.includes(q)) return 50;
  let i = 0;
  for (const ch of hay) if (ch === q[i]) i += 1;
  return i === q.length ? 10 : 0;
}

/** Ctrl+K palette: jump to any channel, DM or server, toggle voice, change theme, open settings. */
export function CommandPalette() {
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.openPalette);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const channels = useGuildStore((s) => s.channels);
  const guilds = useGuildStore((s) => s.guilds);
  const theme = usePrefsStore((s) => s.theme);
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
      { id: 'home', group: 'Go to', label: 'Friends', icon: <UsersThree size={18} />, run: () => ui.navigate({ kind: 'home', channelId: null }), keywords: 'home direct' },
      { id: 'mute', group: 'Voice', label: 'Toggle mute', icon: <Microphone size={18} />, run: () => void toggleMute(), hint: 'Ctrl+Shift+M' },
      { id: 'deafen', group: 'Voice', label: 'Toggle deafen', icon: <SpeakerHigh size={18} />, run: () => void toggleDeafen(), hint: 'Ctrl+Shift+D' },
      { id: 'newguild', group: 'Actions', label: 'Create a server', icon: <Plus size={18} />, run: () => ui.openDialog({ kind: 'createGuild' }) },
      { id: 'joinguild', group: 'Actions', label: 'Join a server', icon: <Plus size={18} />, run: () => ui.openDialog({ kind: 'joinGuild' }) },
      { id: 'newdm', group: 'Actions', label: 'New message', icon: <At size={18} />, run: () => ui.openDialog({ kind: 'newDm' }) },
      { id: 'settings', group: 'Settings', label: 'User settings', icon: <Gear size={18} />, run: () => ui.openSettings({ kind: 'user', tab: 'account' }) },
      { id: 'privacy', group: 'Settings', label: 'Privacy and delivery modes', icon: <Gear size={18} />, run: () => ui.openSettings({ kind: 'user', tab: 'privacy' }) },
      { id: 'voice', group: 'Settings', label: 'Voice and video settings', icon: <Gear size={18} />, run: () => ui.openSettings({ kind: 'user', tab: 'voice' }) },
      { id: 'theme', group: 'Appearance', label: theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme', icon: theme === 'light' ? <Moon size={18} /> : <Sun size={18} />, run: () => usePrefsStore.getState().set('theme', theme === 'light' ? 'dark' : 'light') },
      { id: 'oled', group: 'Appearance', label: 'Switch to OLED theme', icon: <Moon size={18} />, run: () => usePrefsStore.getState().set('theme', 'oled') },
    ];
    const guildItems: Item[] = Object.values(guilds).map((g) => ({ id: `g-${g.id}`, group: 'Servers', label: g.name, icon: <House size={18} />, run: () => openGuild(g.id) }));
    const channelItems: Item[] = Object.values(channels)
      .filter((c) => c.type !== ChannelType.GUILD_CATEGORY && c.type !== ChannelType.GUILD_FORUM)
      .map((c) => {
        const dm = !c.guild_id;
        const label = dm ? (c.name || (c.recipients ?? []).map((u) => displayName(u)).join(', ') || 'DM') : (c.name ?? '');
        const guildName = c.guild_id ? guilds[c.guild_id]?.name : undefined;
        const voice = isVoiceChannel(c);
        return { id: `c-${c.id}`, group: dm ? 'Direct messages' : 'Channels', label: dm ? label : `${voice ? '' : '#'}${label}`, hint: guildName, icon: dm ? <At size={18} /> : voice ? <SpeakerHigh size={18} /> : <Hash size={18} />, run: () => (voice ? void openVoiceChannel(c.guild_id ?? null, c.id) : openChannel(c.id)) };
      });
    return [...channelItems, ...guildItems, ...base];
  }, [open, channels, guilds, theme]);

  const results = useMemo(() => items.map((i) => ({ i, s: score(query, i) })).filter((r) => r.s > 0).sort((a, b) => b.s - a.s).slice(0, 30).map((r) => r.i), [items, query]);

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
          <motion.div className="palette glass" role="dialog" aria-label="Command palette" initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={snappy}>
            <label className="palette-input">
              <MagnifyingGlass size={18} />
              <input
                autoFocus
                value={query}
                placeholder="Jump to a channel, person or action"
                aria-label="Command palette search"
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
              {results.length === 0 && <li className="palette-none">Nothing matches “{query}”.</li>}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
