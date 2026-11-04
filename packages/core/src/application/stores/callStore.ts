/** DM calls keyed by channel id, from the gateway's CALL_CREATE / CALL_UPDATE / CALL_DELETE. */
import { create } from 'zustand';
import type { CallEvent } from '../../contracts/gateway';
import type { Snowflake } from '../../contracts/rest';
import { dmCallOf, type DmCall } from '../../domain/calls';

export interface CallStoreState {
  calls: Record<Snowflake, DmCall>;
  upsert(event: CallEvent): void;
  remove(channelId: Snowflake): void;
  /** Stops ringing for `userId` locally, ahead of the gateway's update (after accept or decline). */
  stopRinging(channelId: Snowflake, userId: Snowflake): void;
}

export const useCallStore = create<CallStoreState>((set) => ({
  calls: {},
  upsert: (event) => set((s) => ({ calls: { ...s.calls, [event.channel_id]: dmCallOf(event) } })),
  remove: (channelId) =>
    set((s) => {
      const { [channelId]: _ended, ...calls } = s.calls;
      return { calls };
    }),
  stopRinging: (channelId, userId) =>
    set((s) => {
      const call = s.calls[channelId];
      if (!call) return s;
      return { calls: { ...s.calls, [channelId]: { ...call, ringing: call.ringing.filter((id) => id !== userId) } } };
    }),
}));
