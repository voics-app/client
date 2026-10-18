import { useEffect } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { usePrefsStore, type Keybind } from '@renderer/application/stores/prefsStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { isTextChannel } from './navigation';
import { openChannel } from './navigation';
import { toggleDeafen, toggleMute } from './voiceActions';

export function describeEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) parts.push(key === ' ' ? 'Space' : key);
  return parts.join('+');
}

function adjacentChannel(delta: 1 | -1): void {
  const view = useUiStore.getState().view;
  if (view.kind !== 'guild') return;
  const list = Object.values(useGuildStore.getState().channels)
    .filter((c) => c.guild_id === view.guildId && isTextChannel(c))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const i = list.findIndex((c) => c.id === view.channelId);
  const next = list[(i + delta + list.length) % list.length];
  if (next) openChannel(next.id);
}

const ACTIONS: Record<Keybind['action'], () => void> = {
  palette: () => useUiStore.getState().openPalette(!useUiStore.getState().paletteOpen),
  toggleMute: () => void toggleMute(),
  toggleDeafen: () => void toggleDeafen(),
  markRead: () => undefined,
  search: () => useUiStore.getState().openPalette(true),
  upload: () => document.querySelector<HTMLButtonElement>('button[aria-label="Attach files"]')?.click(),
  prevChannel: () => adjacentChannel(-1),
  nextChannel: () => adjacentChannel(1),
};

/** Registers the user-configurable in-app shortcuts. Global (out-of-focus) push-to-talk lives in the main process. */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const described = describeEvent(e);
      const bind = usePrefsStore.getState().keybinds.find((k) => k.keys === described && k.action !== 'markRead');
      if (!bind) return;
      e.preventDefault();
      ACTIONS[bind.action]();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
