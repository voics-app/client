/** Slash command catalogue, in-flight interactions ("is thinking…") and the open modal. */
import { create } from 'zustand';
import type { MessageComponent } from '../../contracts/rest';
import type { ContextCommand } from '../../domain/contextCommands';
import type { SlashEntry } from '../../domain/slashCommand';

/** Deferred responses may take up to fifteen minutes; after that the placeholder is dropped. */
export const PENDING_TTL_MS = 15 * 60_000;

export interface PendingInteraction {
  id: string;
  channelId: string;
  applicationId: string;
  appName: string;
  label: string;
  startedAt: number;
}

export interface OpenModal {
  interactionId: string;
  applicationId: string;
  channelId: string;
  customId: string;
  title: string;
  components: MessageComponent[];
}

/** Key for the command catalogue of a scope: a guild id, or `dm`. */
export const DM_SCOPE = 'dm';

export interface InteractionState {
  commands: Record<string, SlashEntry[]>;
  /** USER and MESSAGE commands per scope, behind the Apps submenu. */
  contextCommands: Record<string, ContextCommand[]>;
  appNames: Record<string, string>;
  pending: Record<string, PendingInteraction[]>;
  applicationOf: Record<string, string>;
  modal: OpenModal | null;
  setCommands(scope: string, entries: SlashEntry[]): void;
  setContextCommands(scope: string, entries: ContextCommand[]): void;
  invalidateCommands(scope: string): void;
  setAppName(applicationId: string, name: string): void;
  addPending(pending: PendingInteraction): void;
  rememberApplication(interactionId: string, applicationId: string): void;
  resolvePending(channelId: string, interactionId: string): void;
  expirePending(now: number): void;
  openModal(modal: OpenModal): void;
  closeModal(): void;
  reset(): void;
}

const initial = { commands: {}, contextCommands: {}, appNames: {}, pending: {}, applicationOf: {}, modal: null };

export const useInteractionStore = create<InteractionState>((set) => ({
  ...initial,
  setCommands: (scope, entries) => set((s) => ({ commands: { ...s.commands, [scope]: entries } })),
  setContextCommands: (scope, entries) => set((s) => ({ contextCommands: { ...s.contextCommands, [scope]: entries } })),
  invalidateCommands: (scope) =>
    set((s) => {
      const { [scope]: _dropped, ...commands } = s.commands;
      const { [scope]: _droppedContext, ...contextCommands } = s.contextCommands;
      return { commands, contextCommands };
    }),
  setAppName: (applicationId, name) => set((s) => ({ appNames: { ...s.appNames, [applicationId]: name } })),
  addPending: (pending) =>
    set((s) => ({
      pending: { ...s.pending, [pending.channelId]: [...(s.pending[pending.channelId] ?? []), pending] },
      applicationOf: { ...s.applicationOf, [pending.id]: pending.applicationId },
    })),
  rememberApplication: (interactionId, applicationId) => set((s) => ({ applicationOf: { ...s.applicationOf, [interactionId]: applicationId } })),
  resolvePending: (channelId, interactionId) =>
    set((s) => {
      const list = s.pending[channelId];
      if (!list?.some((p) => p.id === interactionId)) return s;
      return { pending: { ...s.pending, [channelId]: list.filter((p) => p.id !== interactionId) } };
    }),
  expirePending: (now) =>
    set((s) => ({
      pending: Object.fromEntries(Object.entries(s.pending).map(([channelId, list]) => [channelId, list.filter((p) => now - p.startedAt < PENDING_TTL_MS)])),
    })),
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null }),
  reset: () => set(initial),
}));
