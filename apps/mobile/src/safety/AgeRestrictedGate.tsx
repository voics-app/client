import type { ReactNode } from 'react';
import { useChannelContentAccess } from './useChannelContentAccess';
import { ScheduledMessagesBoundary } from '../scheduling/ScheduledMessagesBoundary';
import { AgeRestrictedNotice } from './AgeRestrictedNotice';

/** Content unmounts on revocation; the author's scheduling controls retain their drafts. */
export function AgeRestrictedGate({ channelId, children, onExit }: { channelId: string; children: ReactNode; onExit?: () => void }) {
  const { kind } = useChannelContentAccess().access(channelId);
  return <ScheduledMessagesBoundary key={channelId} channelId={channelId}>{(openList) => kind === 'open' ? children : <AgeRestrictedNotice channelId={channelId} {...(onExit ? { onExit } : {})} {...(kind !== 'unavailable' ? { onScheduled: openList } : {})} />}</ScheduledMessagesBoundary>;
}
