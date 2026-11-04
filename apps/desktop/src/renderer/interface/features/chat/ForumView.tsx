import { ChatsCircle, Plus } from '@phosphor-icons/react';
import { useState } from 'react';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { ChannelType } from '@discordy/core/contracts/rest';
import { attempt } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { Button } from '../../shared/ui/Button';
import { Field, Input, TextArea } from '../../shared/ui/Form';
import { EmptyState } from '../../shared/ui/Misc';
import { Modal } from '../../shared/ui/Modal';

/** Forum channel: posts are public threads under the channel. */
export function ForumView({ channelId }: { channelId: string }) {
  const channel = useGuildStore((s) => s.channels[channelId]);
  const channels = useGuildStore((s) => s.channels);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const setPanel = useUiStore((s) => s.setSidePanel);
  const posts = Object.values(channels).filter((c) => c.parent_id === channelId && c.type === ChannelType.PUBLIC_THREAD);

  const create = async () => {
    const thread = await attempt(() => getRuntime().api.createThread(channelId, { name: title.trim(), type: ChannelType.PUBLIC_THREAD, message: { content: body.trim() } }), 'Could not create post');
    if (thread) {
      useGuildStore.getState().upsertChannel({ ...thread, guild_id: channel?.guild_id });
      setCreating(false);
      setTitle('');
      setBody('');
      setPanel({ kind: 'thread', threadId: thread.id });
    }
  };

  return (
    <section className="forum">
      <header className="channel-header">
        <div className="channel-header-title"><ChatsCircle size={22} className="channel-header-icon" /><h1>{channel?.name}</h1>{channel?.topic && <span className="channel-topic">{channel.topic}</span>}</div>
        <div className="channel-header-actions"><Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New post</Button></div>
      </header>
      <div className="forum-list">
        {posts.length === 0 ? (
          <EmptyState icon={<ChatsCircle size={36} weight="light" />} title="No posts yet" body="Start a discussion. Every post is its own thread." action={<Button variant="primary" onClick={() => setCreating(true)}>Create the first post</Button>} />
        ) : (
          posts.map((p) => (
            <button key={p.id} type="button" className="forum-post" onClick={() => setPanel({ kind: 'thread', threadId: p.id })}>
              <h3>{p.name}</h3>
              <span className="tnum">{p.message_count ?? 0} messages</span>
            </button>
          ))
        )}
      </div>
      <Modal open={creating} onClose={() => setCreating(false)} title="New post" footer={<><Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button><Button variant="primary" disabled={!title.trim() || !body.trim()} onClick={() => void create()}>Post</Button></>}>
        <Field label="Title">{(id) => <Input id={id} data-autofocus value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Message">{(id) => <TextArea id={id} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
      </Modal>
    </section>
  );
}
