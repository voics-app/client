import { createContext, useContext, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { scheduleDraftError } from '@discordy/core/domain/scheduledMessages';
import { channelAccess } from '../messages/messageAccess';
import { useChannelContentAccess } from '../safety/useChannelContentAccess';
import { ScheduledMessagesSheet, type ScheduledMessagesSheetProps } from './ScheduledMessagesSheet';

type Opening = Omit<ScheduledMessagesSheetProps, 'onClose'> & { composerMounted?(): boolean };
type Accepted = Opening['onAccepted'];
const ScheduleContext = createContext<{ open(opening: Opening | null): void; accepted: RefObject<Accepted | null> } | null>(null);
export const useScheduledMessagesHost = () => useContext(ScheduleContext);

/** Sibling of the gated route: remote Hide cannot throw away an open schedule edit. */
export function ScheduledMessagesBoundary({ channelId, children }: { channelId: string; children(openList: () => void): ReactNode }) {
  const [opening, setOpening] = useState<Opening | null>(null);
  const accepted = useRef<Accepted | null>(null);
  const host = useMemo(() => ({ open: setOpening, accepted }), []);
  const channels = useGuildStore((s) => s.channels);
  const guilds = useGuildStore((s) => s.guilds);
  const members = useGuildStore((s) => s.members);
  const userId = useSessionStore((s) => s.user?.id);
  const contentAllowed = useChannelContentAccess().canShow(channelId);
  const channel = channels[channelId];
  const guild = channel?.guild_id ? guilds[channel.guild_id] : undefined;
  const access = channel && guild && userId ? channelAccess({ channel, guild, members: members[guild.id], userId, parent: channel.parent_id ? channels[channel.parent_id] : undefined }) : null;
  const canSend = channel !== undefined && (channel.guild_id ? access?.canSend === true : true);
  const canTts = channel !== undefined && (channel.guild_id ? access?.canTts === true : true);
  const openList = () => setOpening({ request: { initial: 'list', draft: { content: '' }, source: { text: '', replyTo: null }, createDisabledReason: scheduleDraftError({ content: '' }) }, context: { channelId, mode: channel?.delivery_mode ?? 'standard', canTts }, canSend, onAccepted: () => undefined });
  return <ScheduleContext.Provider value={host}>
    {children(openList)}
    {opening && <ScheduledMessagesSheet {...opening} context={{ ...opening.context, mode: channel?.delivery_mode ?? opening.context.mode, canTts: opening.context.canTts && canTts }} canSend={opening.canSend && canSend} attachments={contentAllowed && opening.composerMounted?.() ? opening.attachments : undefined} onAccepted={(source) => (accepted.current ?? opening.onAccepted)(source)} onClose={() => setOpening(null)} />}
  </ScheduleContext.Provider>;
}
