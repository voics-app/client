import type { Channel } from '@discordy/core/contracts/rest';
import { ChannelType } from '@discordy/core/contracts/rest';

export const POST_TITLE_MAX = 100;

/** The posts of a forum: its public threads, newest first (a thread's id is a snowflake, so id order is creation order). Archived ones come after the active ones. */
export function forumPosts(channels: Record<string, Channel>, forumId: string): Channel[] {
  const byNewest = (a: Channel, b: Channel) => (a.id.length === b.id.length ? (a.id < b.id ? 1 : -1) : b.id.length - a.id.length);
  const posts = Object.values(channels).filter((c) => c.parent_id === forumId && c.type === ChannelType.PUBLIC_THREAD);
  const archived = (c: Channel) => c.thread_metadata?.archived === true;
  return [...posts.filter((c) => !archived(c)).sort(byNewest), ...posts.filter(archived).sort(byNewest)];
}

/** The request that starts a post: a public thread under the forum whose first message is the body, as desktop sends it. */
export function newPostBody(title: string, body: string, requestId: string, tags: string[] = []) {
  return { name: title.trim(), type: ChannelType.PUBLIC_THREAD, request_id: requestId, applied_tags: tags, message: { content: body.trim() } };
}

/** A post needs a title and a first message. */
export const canPost = (title: string, body: string): boolean => title.trim() !== '' && body.trim() !== '';
