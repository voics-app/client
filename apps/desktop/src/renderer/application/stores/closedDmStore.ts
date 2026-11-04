/** DMs the user closed on this device (api has no per-user hidden flag yet). Persisted to localStorage. */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistedStorage } from '@renderer/application/ports/deviceStorage';
import type { ClosedDms } from '@renderer/domain/dmModel';

interface ClosedDmState {
  closed: ClosedDms;
  close(channelId: string, lastMessageId: string | null | undefined): void;
  reopen(channelId: string): void;
}

export const useClosedDmStore = create<ClosedDmState>()(
  persist(
    (set) => ({
      closed: {},
      close: (channelId, lastMessageId) => set((s) => ({ closed: { ...s.closed, [channelId]: lastMessageId ?? '' } })),
      reopen: (channelId) =>
        set((s) => {
          const { [channelId]: _gone, ...rest } = s.closed;
          return { closed: rest };
        }),
    }),
    { name: 'discordy.closedDms', storage: persistedStorage() },
  ),
);
