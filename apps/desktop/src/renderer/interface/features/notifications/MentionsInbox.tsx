import { At } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { useGuildStore } from '@renderer/application/stores/guildStore';
import { useMentionInboxStore } from '@renderer/application/stores/mentionInboxStore';
import { useUiStore } from '@renderer/application/stores/uiStore';
import { entriesByGuild } from '@renderer/domain/mentionInbox';
import { jumpToMessage } from '../../app/actions';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/Misc';
import { Modal } from '../../shared/ui/Modal';

/** Recent @mentions across servers (Ctrl+I); selecting one jumps to the message. */
export function MentionsInbox() {
  const close = () => useUiStore.getState().openDialog(null);
  const entries = useMentionInboxStore((s) => s.entries);
  const guilds = useGuildStore((s) => s.guilds);
  const channels = useGuildStore((s) => s.channels);
  const visible = useMemo(() => entries.filter((e) => guilds[e.guildId] && channels[e.channelId]), [entries, guilds, channels]);
  const groups = useMemo(() => [...entriesByGuild(visible)], [visible]);
  return (
    <Modal open onClose={close} title="Mentions" width={520}>
      <div className="stack inbox">
        {visible.length === 0 ? (
          <EmptyState icon={<At size={32} weight="light" />} title="No recent mentions" body="Messages that mention you, your roles or @everyone show up here." />
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
                        <strong>{e.authorName}</strong> in #{channels[e.channelId]?.name} <time>{new Date(e.timestamp).toLocaleString()}</time>
                      </span>
                      <span className="inbox-text">{e.preview}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
        <div className="row-end">
          {visible.length > 0 && <Button variant="ghost" onClick={() => useMentionInboxStore.getState().clear()}>Clear all</Button>}
          <Button variant="primary" onClick={close} data-autofocus>Done</Button>
        </div>
      </div>
    </Modal>
  );
}
