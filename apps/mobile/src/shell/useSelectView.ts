import { useEffect } from 'react';
import { useUiStore, type View } from '@discordy/core/application/stores/uiStore';

const same = (a: View, b: View) => a.kind === b.kind && a.channelId === b.channelId && (a.kind !== 'guild' || (b.kind === 'guild' && a.guildId === b.guildId));

/** Makes a route's view the selected one, so the rail and column behind a chat (or after a deep link) show where you are. */
export function useSelectView(view: View | undefined): void {
  const kind = view?.kind;
  const channelId = view?.channelId;
  const guildId = view?.kind === 'guild' ? view.guildId : undefined;
  useEffect(() => {
    if (!kind) return;
    const next = (kind === 'guild' ? { kind, guildId: guildId!, channelId: channelId ?? null } : { kind, channelId: channelId ?? null }) as View;
    if (!same(useUiStore.getState().view, next)) useUiStore.getState().navigate(next);
  }, [kind, guildId, channelId]);
}
