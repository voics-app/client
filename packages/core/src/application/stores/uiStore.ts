/** Navigation and transient UI state. */
import { create } from 'zustand';
import { canGo, emptyHistory, pushView, stepHistory, type NavHistory } from '../../domain/navHistory';
import type { ReportTarget } from '../../domain/reportModel';
import type { BotAuthorizationRequest } from '../../domain/botAuthorization';
import type { ChatMessage } from './messageStore';

export type View =
  | { kind: 'home'; channelId: string | null }
  | { kind: 'discover'; channelId: null }
  | { kind: 'guild'; guildId: string; channelId: string | null };

export type SettingsTarget =
  | { kind: 'user'; tab: UserSettingsTab; profileGuildId?: string }
  | { kind: 'server'; guildId: string; tab: ServerSettingsTab; auditTarget?: { id: string; name: string } }
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
  | 'developer'
  | 'authorizedApps'
  | 'about';

export type ServerSettingsTab = 'overview' | 'roles' | 'emoji' | 'members' | 'invites' | 'template' | 'discovery' | 'bans' | 'audit' | 'integrations';

export type Dialog =
  | { kind: 'botAuthorize'; request: BotAuthorizationRequest }
  | { kind: 'createGuild' }
  | { kind: 'template'; code: string }
  | { kind: 'joinGuild'; code?: string }
  | { kind: 'createChannel'; guildId: string; parentId: string | null; type?: number }
  | { kind: 'invite'; guildId: string; channelId: string }
  | { kind: 'notifications'; targetId: string; name: string; category?: boolean }
  | { kind: 'guildNotifications'; guildId: string }
  | { kind: 'folderSettings'; folderId: number }
  | { kind: 'inbox' }
  | { kind: 'newDm'; preselect?: string[] }
  | { kind: 'groupDm'; channelId: string }
  | { kind: 'screenPicker' }
  | { kind: 'profile'; userId: string; guildId: string | null }
  | { kind: 'customStatus' }
  | { kind: 'shortcuts' }
  | { kind: 'editNickname'; guildId: string; userId: string }
  | { kind: 'ban'; guildId: string; userId: string; name: string }
  | { kind: 'prune'; guildId: string }
  | { kind: 'modView'; guildId: string; userId: string }
  | { kind: 'forward'; message: ChatMessage }
  | { kind: 'report'; target: ReportTarget }
  | { kind: 'reactionUsers'; channelId: string; messageId: string; emoji: string }
  | { kind: 'confirm'; title: string; body: string; confirmLabel: string; confirmText?: string; danger?: boolean; onConfirm: () => void | Promise<void> };

export type SidePanel = { kind: 'members' } | { kind: 'pins' } | { kind: 'search' } | { kind: 'thread'; threadId: string } | { kind: 'watch' } | { kind: 'profile' } | null;

export interface Toast {
  id: number;
  tone: 'info' | 'success' | 'warning' | 'danger';
  title: string;
  body?: string;
}

export interface UiState {
  view: View;
  lastChannelByGuild: Record<string, string>;
  /** Visited views (bounded to 50), driven by `navigate`, `back` and `forward`; in memory only. */
  history: NavHistory<View>;
  paletteOpen: boolean;
  settings: SettingsTarget | null;
  dialog: Dialog | null;
  sidePanel: SidePanel;
  replyTo: Record<string, ChatMessage | null>;
  editing: { channelId: string; messageId: string } | null;
  toasts: Toast[];
  galleryOpen: boolean;
  /** Single entry point for moving to a view; records it in the history (jumping from the middle drops the forward entries). */
  navigate(view: View): void;
  /** Steps one view back or forward in the history without recording a new entry; false when at the end. */
  back(): boolean;
  forward(): boolean;
  openPalette(open: boolean): void;
  openSettings(target: SettingsTarget | null): void;
  openDialog(dialog: Dialog | null): void;
  setSidePanel(panel: SidePanel): void;
  toggleSidePanel(kind: 'members' | 'pins' | 'watch' | 'search' | 'profile'): void;
  /** Bumped by Ctrl+F so the channel header search box takes focus. */
  searchFocus: number;
  focusSearch(): void;
  setReplyTo(channelId: string, message: ChatMessage | null): void;
  setEditing(editing: UiState['editing']): void;
  toast(toast: Omit<Toast, 'id'>): void;
  dismissToast(id: number): void;
}

let toastSeq = 0;

const INITIAL_VIEW: View = { kind: 'home', channelId: null };

/** The state changes shared by every way of showing a view. */
function applyView(s: UiState, view: View): Partial<UiState> {
  return {
    view,
    editing: null,
    lastChannelByGuild: view.kind === 'guild' && view.channelId ? { ...s.lastChannelByGuild, [view.guildId]: view.channelId } : s.lastChannelByGuild,
    sidePanel: s.sidePanel?.kind === 'thread' ? { kind: 'members' } : s.sidePanel,
  };
}

function step(set: (fn: (s: UiState) => Partial<UiState>) => void, get: () => UiState, delta: 1 | -1): boolean {
  if (!canGo(get().history, delta)) return false;
  set((s) => {
    const history = stepHistory(s.history, delta);
    return { ...applyView(s, history.entries[history.index]!), history };
  });
  return true;
}

export const useUiStore = create<UiState>((set, get) => ({
  view: INITIAL_VIEW,
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
  history: pushView(emptyHistory<View>(), INITIAL_VIEW),
  navigate: (view) => set((s) => ({ ...applyView(s, view), history: pushView(s.history, view) })),
  back: () => step(set, get, -1),
  forward: () => step(set, get, 1),
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
