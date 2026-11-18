import { useI18n } from '../../shared/i18n';
import { PushPin } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { canUnpin } from '@discordy/core/domain/chatHeader';
import { attempt, jumpToMessage } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { displayName } from '../../shared/hooks/useNames';
import { useChannelPermissions } from '../../shared/hooks/usePermissions';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/Misc';
import { MessageAttachments } from '../chat/AttachmentView';
import { MessageEmbeds } from '../chat/EmbedView';
import { MarkdownView } from '../chat/MarkdownView';

/** Pinned messages of a channel: jump to one, unpin (moderators), with attachments and embeds shown. */
export function PinsPanel({ channelId }: { channelId: string }) {
  const { t, date } = useI18n();
  const client = useQueryClient();
  const channel = useGuildStore((s) => s.channels[channelId]);
  const perms = useChannelPermissions(channelId);
  const mayUnpin = channel ? canUnpin(channel, perms) : false;
  const key = ['channel', channelId, 'pins'];
  const pins = useQuery({ queryKey: key, queryFn: () => getRuntime().api.pins(channelId) });

  const unpin = async (messageId: string) => {
    const ok = await attempt(async () => {
      await getRuntime().api.unpin(channelId, messageId);
      return true;
    }, t('pins.unpinFailed'));
    if (ok) client.setQueryData(key, (cur: typeof pins.data) => cur?.filter((m) => m.id !== messageId));
  };

  return (
    <div className="panel-body">
      {pins.isLoading && <p className="panel-note">{t('pins.loading')}</p>}
      {pins.isError && <p className="panel-note">{t('pins.loadFailed')}</p>}
      {pins.data?.length === 0 && <EmptyState icon={<PushPin size={32} weight="light" />} title={t('pins.empty')} body={t('pins.help')} />}
      <ul className="pin-list">
        {pins.data?.map((m) => (
          <li key={m.id} className="pin-card">
            <header>
              <Avatar id={m.author.id} name={displayName(m.author)} avatar={m.author.avatar} size={22} />
              <strong>{displayName(m.author)}</strong>
              <time dateTime={m.timestamp}>{date(new Date(m.timestamp))}</time>
            </header>
            {m.content && <MarkdownView source={m.content} guildId={m.guild_id} />}
            {m.attachments.length > 0 && <MessageAttachments attachments={m.attachments} channelId={channelId} />}
            <MessageEmbeds message={m} />
            <div className="pin-actions">
              <Button size="sm" onClick={() => jumpToMessage(channelId, m.id)}>{t('pins.jump')}</Button>
              {mayUnpin && <Button size="sm" variant="ghost" onClick={() => void unpin(m.id)}>{t('pins.unpin')}</Button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
