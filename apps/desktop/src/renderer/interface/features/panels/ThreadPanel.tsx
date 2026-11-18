import { useI18n } from '../../shared/i18n';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { getRuntime } from '../../app/runtime';
import { Composer } from '../chat/Composer';
import { MessageList } from '../chat/MessageList';

export function ThreadPanel({ threadId }: { threadId: string }) {
  const { t: msg } = useI18n();
  const thread = useGuildStore((s) => s.channels[threadId]);
  if (!thread) return <p className="panel-note">{msg("settings.threadpanel.this.thread.is.no.longer.available")}</p>;
  return (
    <div className="thread-panel">
      <p className="thread-title">{thread.name}</p>
      <MessageList channelId={threadId} />
      <Composer channel={thread} mode={getRuntime().privacy.sender.resolveMode(thread)} />
    </div>
  );
}
