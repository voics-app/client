/** Navigation and transient UI state. */
import { create } from 'zustand';
import type { ChatMessage } from './messageStore';

export type View =
  | { kind: 'home'; channelId: string | null }
  | { kind: 'discover'; channelId: null }
  | { kind: 'guild'; guildId: string; channelId: string | null };

export type SettingsTarget =
  | { kind: 'user'; tab: UserSettingsTab }
  | { kind: 'server'; guildId: string; tab: ServerSettingsTab }
  | { kind: 'channel'; channelId: string; tab: 'overview' | 'permissions' | 'invites' };

export type UserSettingsTab =
  | 'account'
  | 'profile'
  | 'privacy'
  | 'devices'
  | 'voice'
  | 'keybinds'
  | 'appearance'
  | 'accessibility'
  | 'notifications'
  | 'chat'
  | 'connection'
  | 'desktop'
  | 'advanced'
  | 'about';

export type ServerSettingsTab = 'overview' | 'roles' | 'emoji' | 'members' | 'invites' | 'template' | 'discovery' | 'bans' | 'audit';

export type Dialog =
  | { kind: 'createGuild' }
  | { kind: 'template'; code: string }
  | { kind: 'joinGuild'; code?: string }
  | { kind: 'createChannel'; guildId: string; parentId: string | null; type?: number }
  | { kind: 'invite'; guildId: string; channelId: string }
  | { kind: 'notifications'; targetId: string; name: string; category?: boolean }
  | { kind: 'guildNotifications'; guildId: string }
  | { kind: 'folderSettings'; folderId: number }
  | { kind: 'inbox' }
  | { kind: 'newDm' }
  | { kind: 'groupDm'; channelId: string }
  | { kind: 'screenPicker' }
  | { kind: 'profile'; userId: string; guildId: string | null }
  | { kind: 'customStatus' }
  | { kind: 'shortcuts' }
  | { kind: 'editNickname'; guildId: string; userId: string }
  | { kind: 'ban'; guildId: string; userId: string; name: string }
  | { kind: 'forward'; message: ChatMessage }
  | { kind: 'reactionUsers'; channelId: string; messageId: string; emoji: string }
  | { kind: 'confirm'; title: string; body: string; confirmLabel: string; danger?: boolean; onConfirm: () => void | Promise<void> };

export type SidePanel = { kind: 'members' } | { kind: 'pins' } | { kind: 'search' } | { kind: 'thread'; threadId: string } | { kind: 'watch' } | null;

export interface Toast {
  id: number;
  tone: 'info' | 'success' | 'warning' | 'danger';
  title: string;
  body?: string;
}

export interface UiState {
  view: View;
  lastChannelByGuild: Record<string, string>;
  paletteOpen: boolean;
  settings: SettingsTarget | null;
  dialog: Dialog | null;
  sidePanel: SidePanel;
  replyTo: Record<string, ChatMessage | null>;
  editing: { channelId: string; messageId: string } | null;
  toasts: Toast[];
  galleryOpen: boolean;
  navigate(view: View): void;
  openPalette(open: boolean): void;
  openSettings(target: SettingsTarget | null): void;
  openDialog(dialog: Dialog | null): void;
  setSidePanel(panel: SidePanel): void;
  toggleSidePanel(kind: 'members' | 'pins' | 'watch' | 'search'): void;
  /** Bumped by Ctrl+F so the channel header search box takes focus. */
  searchFocus: number;
  focusSearch(): void;
  setReplyTo(channelId: string, message: ChatMessage | null): void;
  setEditing(editing: UiState['editing']): void;
  toast(toast: Omit<Toast, 'id'>): void;
  dismissToast(id: number): void;
}

let toastSeq = 0;

export const useUiStore = create<UiState>((set) => ({
  view: { kind: 'home', channelId: null },
  lastChannelByGuild: {},
  paletteOpen: false,
  settings: null,
  dialog: null,
  sidePanel: { kind: 'members' },
  replyTo: {},
  editing: null,
  toasts: [],
  galleryOpen: false,
  searchFocus: 0,
  focusSearch: () => set((s) => ({ searchFocus: s.searchFocus + 1 })),
  navigate: (view) =>
    set((s) => ({
      view,
      editing: null,
      lastChannelByGuild:
        view.kind === 'guild' && view.channelId ? { ...s.lastChannelByGuild, [view.guildId]: view.channelId } : s.lastChannelByGuild,
      sidePanel: s.sidePanel?.kind === 'thread' ? { kind: 'members' } : s.sidePanel,
    })),
  openPalette: (paletteOpen) => set({ paletteOpen }),
  openSettings: (settings) => set({ settings }),
  openDialog: (dialog) => set({ dialog }),
  setSidePanel: (sidePanel) => set({ sidePanel }),
  toggleSidePanel: (kind) => set((s) => ({ sidePanel: s.sidePanel?.kind === kind ? null : { kind } })),
  setReplyTo: (channelId, message) => set((s) => ({ replyTo: { ...s.replyTo, [channelId]: message } })),
  setEditing: (editing) => set({ editing }),
  toast: (toast) => {
    toastSeq += 1;
    const id = toastSeq;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...toast, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 5000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
