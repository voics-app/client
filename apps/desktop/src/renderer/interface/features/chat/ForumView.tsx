import { ChatsCircle, Plus } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useDraftStore } from '@discordy/core/application/stores/composerStores';
import { useSessionStore } from '@discordy/core/application/stores/sessionStore';
import { useGuildStore } from '@discordy/core/application/stores/guildStore';
import { useUiStore } from '@discordy/core/application/stores/uiStore';
import { AttachmentFlag, ChannelType, type Channel } from '@discordy/core/contracts/rest';
import { Permission } from '@discordy/core/contracts/permissions';
import { can, useChannelPermissions } from '../../shared/hooks/usePermissions';
import { attempt } from '../../app/actions';
import { getRuntime } from '../../app/runtime';
import { Button } from '../../shared/ui/Button';
import { Field, Input, TextArea } from '../../shared/ui/Form';
import { EmptyState } from '../../shared/ui/Misc';
import { Modal } from '../../shared/ui/Modal';

interface ForumRequest { request_id: string; name: string; content: string; tags: string[] }
function readForumRequest(key: string): ForumRequest | null {
  try {
    const raw = useDraftStore.getState().drafts[key]?.text;
    const draft = raw ? JSON.parse(raw) as ForumRequest : null;
    return draft && typeof draft.request_id === 'string' && typeof draft.name === 'string' && typeof draft.content === 'string' && Array.isArray(draft.tags) ? draft : null;
  } catch { return null; }
}

/** Forum channel: posts are public threads under the channel. */
export function ForumView({ channelId }: { channelId: string }) {
  const channel = useGuildStore((s) => s.channels[channelId]);
  const channels = useGuildStore((s) => s.channels);
  const userId = useSessionStore((s) => s.user?.id);
  const draftKey = `forum-post:${userId ?? 'unknown'}:${channelId}`;
  const [pendingRequest, setPendingRequest] = useState<ForumRequest | null>(() => readForumRequest(draftKey));
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [title, setTitle] = useState(() => readForumRequest(draftKey)?.name ?? '');
  const [body, setBody] = useState(() => readForumRequest(draftKey)?.content ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>(() => readForumRequest(draftKey)?.tags ?? []);
  const [filterTag, setFilterTag] = useState('');
  const [sort, setSort] = useState(channel?.default_sort_order === 1 ? 'created' : 'activity');
  const [layout, setLayout] = useState(channel?.default_forum_layout === 1 ? 'list' : 'gallery');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadFailed(false);
    void attempt(() => getRuntime().api.listForumPosts(channelId), 'Could not load forum posts').then((loaded) => {
      if (!active) return;
      if (loaded) loaded.forEach((post) => useGuildStore.getState().upsertChannel(post));
      else setLoadFailed(true);
      setLoading(false);
    });
    return () => { active = false; };
  }, [channelId]);
  const setPanel = useUiStore((s) => s.setSidePanel);
  const mayManageThreads = can(useChannelPermissions(channelId), Permission.MANAGE_THREADS);
  const tags = channel?.available_tags ?? [];
  const posts = Object.values(channels).filter((c) => c.parent_id === channelId && c.type === ChannelType.PUBLIC_THREAD && (!filterTag || c.applied_tags?.includes(filterTag)));
  posts.sort((a, b) => {
    const pinOrder = Number(Boolean((b.flags ?? 0) & 2)) - Number(Boolean((a.flags ?? 0) & 2));
    const aKey = sort === 'activity' ? (a.last_message_id ?? a.id) : a.id;
    const bKey = sort === 'activity' ? (b.last_message_id ?? b.id) : b.id;
    return pinOrder || (aKey === bKey ? 0 : BigInt(aKey) > BigInt(bKey) ? -1 : 1);
  });
  const togglePin = async (post: Channel) => {
    const updated = await attempt(() => getRuntime().api.updateChannel(post.id, { flags: (post.flags ?? 0) ^ 2 }), 'Could not update pinned post');
    if (updated) useGuildStore.getState().upsertChannel(updated);
  };

  const close = () => {
    if (submitting) return;
    setCreating(false);
    if (!pendingRequest) { setTitle(''); setBody(''); setSelectedTags([]); }
  };

  const create = async () => {
    if (submitting || !channel || channel.delivery_mode !== 'standard' || !userId) return;
    setSubmitting(true);
    const request = pendingRequest ?? { request_id: crypto.randomUUID(), name: title.trim(), content: body.trim(), tags: selectedTags };
    setPendingRequest(request);
    useDraftStore.getState().setDraft(draftKey, JSON.stringify(request), null);
    const thread = await attempt(() => getRuntime().api.createThread(channelId, { name: request.name, type: ChannelType.PUBLIC_THREAD, applied_tags: request.tags, request_id: request.request_id, message: { content: request.content } }), 'Could not create post');
    if (thread?.forum_post_status === 'failed') setRequestFailed(true);
    if (thread?.forum_post_status === 'published') {
      useGuildStore.getState().upsertChannel({ ...thread, guild_id: channel.guild_id });
      useDraftStore.getState().clearDraft(draftKey);
      setPendingRequest(null);
      setCreating(false);
      setTitle('');
      setBody('');
      setSelectedTags([]);
      setPanel({ kind: 'thread', threadId: thread.id });
    }
    setSubmitting(false);
  };

  return (
    <section className="forum">
      <header className="channel-header">
        <div className="channel-header-title"><ChatsCircle size={22} className="channel-header-icon" /><h1>{channel?.name}</h1>{channel?.topic && <span className="channel-topic">{channel.topic}</span>}</div>
        <div className="channel-header-actions"><Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New post</Button></div>
      </header>
      <div className="forum-controls"><label>Sort <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="activity">Recent activity (when available)</option><option value="created">Newest posts</option></select></label><label>Filter tags <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)}><option value="">All tags</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label><label>Layout <select value={layout} onChange={(e) => setLayout(e.target.value)}><option value="list">List</option><option value="gallery">Gallery</option></select></label></div>
      <div className={`forum-list${layout === 'list' ? ' forum-list--rows' : ''}`}>
        {loading && posts.length === 0 ? <p>Loading posts...</p> : loadFailed && posts.length === 0 ? <p>Could not load posts. Reopen the forum to try again.</p> : posts.length === 0 ? (
          <EmptyState icon={<ChatsCircle size={36} weight="light" />} title="No posts yet" body="Start a discussion. Every post is its own thread." action={<Button variant="primary" onClick={() => setCreating(true)}>Create the first post</Button>} />
        ) : (
          posts.map((p) => (
            <article key={p.id} className="forum-post">
              <button type="button" onClick={() => setPanel({ kind: 'thread', threadId: p.id })}>
                {(p.flags ?? 0) & 2 ? <span>Pinned - </span> : null}<strong>{p.name}</strong>
              </button>
              {p.forum_first_message?.content && <p className="forum-preview">{p.forum_first_message.content}</p>}
              {layout === 'gallery' && p.forum_first_message?.attachments.filter((attachment) => attachment.content_type?.startsWith('image/') && !((attachment.flags ?? 0) & AttachmentFlag.IS_SPOILER)).slice(0, 1).map((attachment) => <img key={attachment.id} className="forum-cover" src={attachment.proxy_url ?? attachment.url} alt={attachment.description ?? ''} loading="lazy" />)}
              <span>{p.applied_tags?.map((id) => tags.find((tag) => tag.id === id)?.name).filter(Boolean).join(', ')}</span>
              {p.message_count != null && <span className="tnum">{Math.max(0, p.message_count - 1)} replies</span>}
              {mayManageThreads && <Button size="sm" onClick={() => void togglePin(p)}>{(p.flags ?? 0) & 2 ? 'Unpin' : 'Pin'}</Button>}
            </article>
          ))
        )}
      </div>
      <Modal open={creating} onClose={close} title="New post" footer={<><Button variant="ghost" disabled={submitting} onClick={close}>Close</Button>{requestFailed ? <Button variant="primary" onClick={() => { useDraftStore.getState().clearDraft(draftKey); setPendingRequest(null); setRequestFailed(false); }}>Start a new request</Button> : <Button variant="primary" disabled={submitting || !userId || channel?.delivery_mode !== 'standard' || !title.trim() || !body.trim() || (!!channel?.require_tags && selectedTags.length === 0)} onClick={() => void create()}>{pendingRequest ? 'Check status' : 'Post'}</Button>}</>}>
        {pendingRequest && <p>{requestFailed ? 'The opening message was deleted. You can start a new request with this text.' : 'Your post is pending or its status is unknown. Check status using the same request; no second post will be created.'}</p>}
        {channel?.delivery_mode !== 'standard' && <p>New posts are not yet available in private delivery mode.</p>}
        {tags.length > 0 && <fieldset><legend>Tags{channel?.require_tags ? ' (required)' : ''}</legend>{tags.map((tag) => <label key={tag.id}><input type="checkbox" checked={selectedTags.includes(tag.id)} disabled={!!pendingRequest || (!selectedTags.includes(tag.id) && selectedTags.length >= 5)} onChange={(e) => setSelectedTags(e.target.checked ? [...selectedTags, tag.id] : selectedTags.filter((id) => id !== tag.id))} /> {tag.name}</label>)}</fieldset>}
        <Field label="Title">{(id) => <Input id={id} data-autofocus value={title} maxLength={100} disabled={!!pendingRequest} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Message">{(id) => <TextArea id={id} value={body} disabled={!!pendingRequest} onChange={(e) => setBody(e.target.value)} />}</Field>
      </Modal>
    </section>
  );
}
