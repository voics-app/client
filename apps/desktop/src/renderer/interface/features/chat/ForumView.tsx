import { ChatsCircle, Plus } from '@phosphor-icons/react';
import { useState } from 'react';
import { useDraftStore } from '@discordy/core/application/stores/composerStores';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { ChannelType, type Channel } from '@discordy/core/contracts/rest';
import { Permission } from '@discordy/core/contracts/permissions';
import { can, useChannelPermissions } from '../../shared/hooks/usePermissions';
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
  const [submitting, setSubmitting] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [filterTag, setFilterTag] = useState('');
  const [layout, setLayout] = useState(channel?.default_forum_layout === 1 ? 'list' : 'gallery');
  const [draftPost, setDraftPost] = useState<Channel | null>(null);
  const setPanel = useUiStore((s) => s.setSidePanel);
  const mayManageThreads = can(useChannelPermissions(channelId), Permission.MANAGE_THREADS);
  const tags = channel?.available_tags ?? [];
  const posts = Object.values(channels).filter((c) => c.parent_id === channelId && c.type === ChannelType.PUBLIC_THREAD && (!filterTag || c.applied_tags?.includes(filterTag)));
  posts.sort((a, b) => Number(Boolean((b.flags ?? 0) & 2)) - Number(Boolean((a.flags ?? 0) & 2)) || (a.id === b.id ? 0 : BigInt(a.id) > BigInt(b.id) ? -1 : 1));
  const togglePin = async (post: Channel) => {
    const updated = await attempt(() => getRuntime().api.updateChannel(post.id, { flags: (post.flags ?? 0) ^ 2 }), 'Could not update pinned post');
    if (updated) useGuildStore.getState().upsertChannel(updated);
  };

  const close = () => {
    if (submitting) return;
    setCreating(false);
    setDraftPost(null);
    setTitle('');
    setBody('');
    setSelectedTags([]);
  };

  const openDraft = () => {
    if (!draftPost) return;
    if (draftPost.delivery_mode === 'standard') useDraftStore.getState().setDraft(draftPost.id, body, null);
    setPanel({ kind: 'thread', threadId: draftPost.id });
    close();
  };

  const create = async () => {
    if (submitting) return;
    setSubmitting(true);
    const thread = draftPost ?? await attempt(() => getRuntime().api.createThread(channelId, { name: title.trim(), type: ChannelType.PUBLIC_THREAD, applied_tags: selectedTags }), 'Could not create post');
    if (thread) {
      const post = { ...thread, guild_id: channel?.guild_id };
      useGuildStore.getState().upsertChannel(post);
      setDraftPost(post);
      // The thread endpoint currently ignores its message field. Use the normal
      // message delivery path and retain the draft if delivery fails.
      const sent = await attempt(async () => { await getRuntime().privacy.sender.send(post, { content: body.trim() }); return true; }, 'Could not send the first message');
      if (sent) {
        setCreating(false);
        setTitle('');
        setBody('');
        setDraftPost(null);
        setPanel({ kind: 'thread', threadId: thread.id });
      }
    }
    setSubmitting(false);
  };

  return (
    <section className="forum">
      <header className="channel-header">
        <div className="channel-header-title"><ChatsCircle size={22} className="channel-header-icon" /><h1>{channel?.name}</h1>{channel?.topic && <span className="channel-topic">{channel.topic}</span>}</div>
        <div className="channel-header-actions"><Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New post</Button></div>
      </header>
      <div className="forum-controls"><label>Filter tags <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)}><option value="">All tags</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label><label>Layout <select value={layout} onChange={(e) => setLayout(e.target.value)}><option value="list">List</option><option value="gallery">Gallery</option></select></label></div>
      <div className={`forum-list${layout === 'list' ? ' forum-list--rows' : ''}`}>
        {posts.length === 0 ? (
          <EmptyState icon={<ChatsCircle size={36} weight="light" />} title="No posts yet" body="Start a discussion. Every post is its own thread." action={<Button variant="primary" onClick={() => setCreating(true)}>Create the first post</Button>} />
        ) : (
          posts.map((p) => (
            <article key={p.id} className="forum-post">
              <button type="button" onClick={() => setPanel({ kind: 'thread', threadId: p.id })}>
                {(p.flags ?? 0) & 2 ? <span>Pinned ? </span> : null}<strong>{p.name}</strong>
              </button>
              <span>{p.applied_tags?.map((id) => tags.find((tag) => tag.id === id)?.name).filter(Boolean).join(' ? ')}</span>
              {p.message_count != null && <span className="tnum">{Math.max(0, p.message_count - 1)} replies</span>}
              {mayManageThreads && <Button size="sm" onClick={() => void togglePin(p)}>{(p.flags ?? 0) & 2 ? 'Unpin' : 'Pin'}</Button>}
            </article>
          ))
        )}
      </div>
      <Modal open={creating} onClose={close} title="New post" footer={<><Button variant="ghost" disabled={submitting} onClick={close}>Cancel</Button>{draftPost ? <Button variant="primary" onClick={openDraft}>Open post</Button> : <Button variant="primary" disabled={submitting || !title.trim() || !body.trim() || (!!channel?.require_tags && selectedTags.length === 0)} onClick={() => void create()}>Post</Button>}</>}>
        {draftPost && <p>The post was created, but message delivery could not be confirmed. Open the post to check it before trying again. Check the post before sending again; copy the text below if you need to keep it.</p>}
        {tags.length > 0 && <fieldset><legend>Tags{channel?.require_tags ? ' (required)' : ''}</legend>{tags.map((tag) => <label key={tag.id}><input type="checkbox" checked={selectedTags.includes(tag.id)} disabled={!selectedTags.includes(tag.id) && selectedTags.length >= 5} onChange={(e) => setSelectedTags(e.target.checked ? [...selectedTags, tag.id] : selectedTags.filter((id) => id !== tag.id))} /> {tag.name}</label>)}</fieldset>}
        <Field label="Title">{(id) => <Input id={id} data-autofocus value={title} maxLength={100} disabled={!!draftPost} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Message">{(id) => <TextArea id={id} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
      </Modal>
    </section>
  );
}
