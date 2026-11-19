import { StickerImage } from './StickerImage';
import { ArrowBendUpRight } from '@phosphor-icons/react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import type { ChatMessage } from '@discordy/core/application/stores/messageStore';
import { forwardSnapshot } from '@discordy/core/domain/forward';
import { Permission } from '@discordy/core/contracts/permissions';
import { jumpToMessage } from '../../app/actions';
import { can, useChannelPermissions } from '../../shared/hooks/usePermissions';
import { MessageAttachments } from './AttachmentView';
import { MessageEmbeds } from './EmbedView';
import { MarkdownView } from './MarkdownView';

/** The frozen copy of a forwarded message, with a "Forwarded" header and a jump link when the viewer can see the source channel. */
export function ForwardedMessage({ message, guildId }: { message: ChatMessage; guildId: string | null | undefined }) {
  const snapshot = forwardSnapshot(message);
  const reference = message.message_reference;
  const sourceKnown = useGuildStore((s) => Boolean(reference?.channel_id && s.channels[reference.channel_id]));
  const sourcePerms = useChannelPermissions(reference?.channel_id);
  if (!snapshot) return null;
  const canJump = Boolean(reference?.channel_id && reference.message_id) && sourceKnown && can(sourcePerms, Permission.VIEW_CHANNEL) && can(sourcePerms, Permission.READ_MESSAGE_HISTORY);
  return (
    <div className="forwarded">
      <div className="forwarded-head">
        <ArrowBendUpRight size={14} aria-hidden="true" />
        <span>Forwarded</span>
        <time dateTime={snapshot.timestamp}>{new Date(snapshot.timestamp).toLocaleDateString([], { dateStyle: 'medium' })}</time>
        {canJump && (
          <button type="button" className="forwarded-jump" onClick={() => jumpToMessage(reference!.channel_id!, reference!.message_id!)}>
            Jump to original
          </button>
        )}
      </div>
      {snapshot.content && <MarkdownView source={snapshot.content} guildId={guildId} />}
      {snapshot.sticker_items?.map((sticker) => <StickerImage key={sticker.id} sticker={sticker} />)}
      {snapshot.attachments.length > 0 && <MessageAttachments attachments={snapshot.attachments} channelId={message.channel_id} />}
      {snapshot.embeds.length > 0 && <MessageEmbeds message={{ ...message, embeds: snapshot.embeds }} />}
    </div>
  );
}
