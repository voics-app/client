import type { Attachment, Message } from '@discordy/core/contracts/rest';
import { displayFilename, previewKind } from '@discordy/core/domain/media';
import { hostOf } from '@discordy/core/domain/linkTrust';

export type SearchTab = 'messages' | 'media' | 'files' | 'links';

export const SEARCH_TABS: readonly { id: SearchTab; label: string }[] = [
  { id: 'messages', label: 'Messages' },
  { id: 'media', label: 'Media' },
  { id: 'files', label: 'Files' },
  { id: 'links', label: 'Links' },
];

/**
 * The searches a tab needs, as query strings: the typed query with a `has:` filter added. Media is images or videos, which the server cannot
 * ask for in one query, so it runs two and the results are merged.
 */
export function tabQueries(tab: SearchTab, input: string): string[] {
  const query = input.trim();
  const add = (has: string) => `${query} has:${has}`.trim();
  switch (tab) {
    case 'media':
      return [add('image'), add('video')];
    case 'files':
      return [add('file')];
    case 'links':
      return [add('link')];
    default:
      return [query];
  }
}

/** The matching message of each result group (a group is the hit with the messages around it). */
export function hitsOf(groups: readonly Message[][]): Message[] {
  return groups.flatMap((group) => group.find((m) => m.hit) ?? group[0] ?? []);
}

export interface MediaTile {
  key: string;
  attachment: Attachment;
  message: Message;
  video: boolean;
}

/** Every image and video attached to the hits, newest message first. */
export function mediaTiles(hits: readonly Message[]): MediaTile[] {
  return hits.flatMap((message) =>
    message.attachments.flatMap((attachment) => {
      const kind = previewKind(attachment);
      return kind === 'image' || kind === 'video' ? [{ key: `${message.id}:${attachment.id}`, attachment, message, video: kind === 'video' }] : [];
    }),
  );
}

export interface FileRow {
  key: string;
  attachment: Attachment;
  message: Message;
  name: string;
}

/** Every attachment of the hits that is not an image or a video (documents, audio, archives). */
export function fileRows(hits: readonly Message[]): FileRow[] {
  return hits.flatMap((message) =>
    message.attachments.flatMap((attachment) => {
      const kind = previewKind(attachment);
      return kind === 'image' || kind === 'video' ? [] : [{ key: `${message.id}:${attachment.id}`, attachment, message, name: displayFilename(attachment.filename) }];
    }),
  );
}

export interface LinkRow {
  key: string;
  url: string;
  host: string;
  message: Message;
}

const URL_PATTERN = /https?:\/\/[^\s<>]+/gi;
const TRAILING = /[.,;:!?)\]}'"]+$/;

/** The web links written in a message's text, without trailing punctuation or duplicates. */
export function linksIn(content: string): string[] {
  const urls = (content.match(URL_PATTERN) ?? []).map((url) => url.replace(TRAILING, ''));
  return [...new Set(urls)];
}

/** Every link in the hits' text, newest message first. */
export function linkRows(hits: readonly Message[]): LinkRow[] {
  return hits.flatMap((message) => linksIn(message.content).map((url) => ({ key: `${message.id}:${url}`, url, host: hostOf(url) ?? url, message })));
}
