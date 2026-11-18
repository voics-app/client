import { createContext, useContext, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { Permission } from '@discordy/core/contracts/permissions';
import { scheduleDraftError } from '@discordy/core/domain/scheduledMessages';
import { can, useChannelPermissions } from '../../shared/hooks/usePermissions';
import { ScheduledMessagesDialog, type ScheduledMessagesDialogProps } from './ScheduledMessagesDialog';

type Opening = Omit<ScheduledMessagesDialogProps, 'onClose'>;
type Accepted = Opening['onAccepted'];
const ScheduleContext = createContext<{ open(opening: Opening | null): void; accepted: RefObject<Accepted | null> } | null>(null);
export const useScheduledMessagesHost = () => useContext(ScheduleContext);

/** Sibling of the gated stage: remote Hide cannot throw away an open schedule edit. */
export function ScheduledMessagesBoundary({ channelId, children }: { channelId: string; children(openList: () => void): ReactNode }) {
  const [opening, setOpening] = useState<Opening | null>(null);
  const accepted = useRef<Accepted | null>(null);
  const host = useMemo(() => ({ open: setOpening, accepted }), []);
  const channel = useGuildStore((s) => s.channels[channelId]);
  const guild = useGuildStore((s) => channel?.guild_id ? s.guilds[channel.guild_id] : undefined);
  const permissions = useChannelPermissions(channelId);
  const canSend = channel !== undefined && (!channel.guild_id || Boolean(guild) && can(permissions, channel.type >= 10 && channel.type <= 12 ? Permission.SEND_MESSAGES_IN_THREADS : Permission.SEND_MESSAGES));
  const canTts = channel !== undefined && (!channel.guild_id || Boolean(guild) && can(permissions, Permission.SEND_TTS_MESSAGES));
  const openList = () => setOpening({ channelId, mode: channel?.delivery_mode ?? 'standard', initial: 'list', draft: { content: '' }, source: { text: '', replyTo: null }, createDisabledReason: scheduleDraftError({ content: '' }), canSend, canTts, onAccepted: () => undefined });
  return <ScheduleContext.Provider value={host}>
    {children(openList)}
    {opening && <ScheduledMessagesDialog {...opening} mode={channel?.delivery_mode ?? opening.mode} canSend={opening.canSend && canSend} canTts={opening.canTts && canTts} onAccepted={(source) => (accepted.current ?? opening.onAccepted)(source)} onClose={() => setOpening(null)} />}
  </ScheduleContext.Provider>;
}
