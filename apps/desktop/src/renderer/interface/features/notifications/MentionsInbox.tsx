import { useI18n } from '../../shared/i18n';
import { At } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useMentionInboxStore } from '@discordy/core/application/stores/mentionInboxStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { entriesByGuild } from '@discordy/core/domain/mentionInbox';
import { jumpToMessage } from '../../app/actions';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/Misc';
import { Modal } from '../../shared/ui/Modal';

/** Recent @mentions across servers (Ctrl+I); selecting one jumps to the message. */
export function MentionsInbox() {
  const { t, date } = useI18n();
  const close = () => useUiStore.getState().openDialog(null);
  const entries = useMentionInboxStore((s) => s.entries);
  const guilds = useGuildStore((s) => s.guilds);
  const channels = useGuildStore((s) => s.channels);
  const visible = useMemo(() => entries.filter((e) => guilds[e.guildId] && channels[e.channelId]), [entries, guilds, channels]);
  const groups = useMemo(() => [...entriesByGuild(visible)], [visible]);
  return (
    <Modal open onClose={close} title={t('inbox.title')} width={520}>
      <div className="stack inbox">
        {visible.length === 0 ? (
          <EmptyState icon={<At size={32} weight="light" />} title={t('inbox.empty')} body={t('inbox.help')} />
        ) : (
          groups.map(([guildId, list]) => (
            <section key={guildId} className="inbox-group">
              <h4>{guilds[guildId]?.name}</h4>
              <ul>
                {list.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      className="inbox-item"
                      onClick={() => {
                        close();
                        jumpToMessage(e.channelId, e.id);
                      }}
                    >
                      <span className="inbox-meta">
                        <strong>{e.authorName}</strong> {t('inbox.location', { name: channels[e.channelId]?.name ?? '' })} <time dateTime={e.timestamp}>{date(new Date(e.timestamp), { dateStyle: 'medium', timeStyle: 'short' })}</time>
                      </span>
                      <span className="inbox-text" dir="auto">{e.preview}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
        <div className="row-end">
          {visible.length > 0 && <Button variant="ghost" onClick={() => useMentionInboxStore.getState().clear()}>{t('inbox.clear')}</Button>}
          <Button variant="primary" onClick={close} data-autofocus>{t('common.done')}</Button>
        </div>
      </div>
    </Modal>
  );
}
