/** Message search: the query language (from:, in:, has: ...), suggestions, API params and local matching. Pure. */
import type { Message } from '@shared/contracts/rest';
import { compareSnowflakes, timestampOf } from './snowflake';

export const FILTER_KEYS = ['from', 'mentions', 'has', 'in', 'before', 'after', 'during', 'pinned'] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export const HAS_KINDS = ['link', 'embed', 'file', 'image', 'video', 'sound'] as const;
export type HasKind = (typeof HAS_KINDS)[number];

const FILTER_HINTS: Record<FilterKey, string> = {
  from: 'a user',
  mentions: 'a mentioned user',
  has: 'link, embed, file, image, video, sound',
  in: 'a channel',
  before: 'before a date',
  after: 'after a date',
  during: 'on a date',
  pinned: 'true or false',
};

export interface FilterToken {
  key: FilterKey;
  value: string;
  /** The text as typed, for removal and chips. */
  raw: string;
}

export interface ParsedQuery {
  /** The free text left after the filters are taken out. */
  text: string;
  filters: FilterToken[];
}

/** Splits on spaces, keeping quoted runs (`from:"Jane Doe"`, `"exact phrase"`) together. */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quoted = false;
  for (const ch of input) {
    if (ch === '"') quoted = !quoted;
    if (ch === ' ' && !quoted) {
      if (current) tokens.push(current);
      current = '';
    } else current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

const unquote = (value: string) => value.replace(/^"(.*)"$/, '$1');

export function parseQuery(input: string): ParsedQuery {
  const filters: FilterToken[] = [];
  const text: string[] = [];
  for (const token of tokenize(input)) {
    const colon = token.indexOf(':');
    const key = colon > 0 ? token.slice(0, colon).toLowerCase() : '';
    const value = colon > 0 ? unquote(token.slice(colon + 1)) : '';
    if ((FILTER_KEYS as readonly string[]).includes(key) && value) filters.push({ key: key as FilterKey, value, raw: token });
    else text.push(token);
  }
  return { text: text.join(' '), filters };
}

/** The query text without one filter token. */
export function withoutFilter(input: string, token: FilterToken): string {
  return tokenize(input).filter((t) => t !== token.raw).join(' ');
}

export interface Suggestion {
  label: string;
  hint?: string;
  /** Replaces the token being typed. */
  insert: string;
}

export interface SuggestionContext {
  users: { id: string; name: string }[];
  channels: { id: string; name: string }[];
  now?: Date;
}

const quoteIfNeeded = (value: string) => (/\s/.test(value) ? `"${value}"` : value);

export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Suggestions for the token under the caret (the last one). */
export function suggest(input: string, ctx: SuggestionContext, limit = 8): Suggestion[] {
  const endsOpen = input.length > 0 && !input.endsWith(' ');
  const last = endsOpen ? (tokenize(input).at(-1) ?? '') : '';
  // After a finished token (trailing space) only an empty box offers the operator list.
  if (last === '' && input.trim() !== '') return [];
  const colon = last.indexOf(':');
  if (colon < 0) {
    const prefix = last.toLowerCase();
    if (prefix.startsWith('"')) return [];
    return FILTER_KEYS.filter((k) => k.startsWith(prefix))
      .slice(0, limit)
      .map((k) => ({ label: `${k}:`, hint: FILTER_HINTS[k], insert: `${k}:` }));
  }
  const key = last.slice(0, colon).toLowerCase() as FilterKey;
  const typed = unquote(last.slice(colon + 1)).toLowerCase();
  const done = (value: string) => `${key}:${quoteIfNeeded(value)} `;
  switch (key) {
    case 'has':
      return HAS_KINDS.filter((k) => k.startsWith(typed)).map((k) => ({ label: `has:${k}`, insert: done(k) }));
    case 'pinned':
      return ['true', 'false'].filter((v) => v.startsWith(typed)).map((v) => ({ label: `pinned:${v}`, insert: done(v) }));
    case 'from':
    case 'mentions':
      return ctx.users
        .filter((u) => u.name.toLowerCase().includes(typed))
        .slice(0, limit)
        .map((u) => ({ label: `${key}:${u.name}`, insert: done(u.name) }));
    case 'in':
      return ctx.channels
        .filter((c) => c.name.toLowerCase().includes(typed))
        .slice(0, limit)
        .map((c) => ({ label: `in:#${c.name}`, insert: done(c.name) }));
    case 'before':
    case 'after':
    case 'during': {
      const today = isoDay(ctx.now ?? new Date());
      return today.startsWith(typed) || typed === '' ? [{ label: `${key}:${today}`, hint: 'today', insert: done(today) }] : [];
    }
    default:
      return [];
  }
}

export function applySuggestion(input: string, suggestion: Suggestion): string {
  const endsOpen = input.length > 0 && !input.endsWith(' ');
  const tokens = tokenize(input);
  const head = endsOpen ? tokens.slice(0, -1) : tokens;
  return [...head, suggestion.insert].join(' ');
}

// ---- API parameters ---------------------------------------------------------------------------

export interface SearchParams {
  content?: string;
  author_id?: string[];
  mentions?: string[];
  has?: HasKind[];
  channel_id?: string[];
  min_id?: string;
  max_id?: string;
  pinned?: boolean;
  sort_by?: 'timestamp' | 'relevance';
  sort_order?: 'asc' | 'desc';
  offset?: number;
  limit?: number;
}

export interface Resolved {
  params: SearchParams;
  /** Filters that name something that does not exist, shown instead of searching. */
  problems: string[];
}

const DAY_MS = 86_400_000;

function startOfDay(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function snowflakeAt(ms: number): bigint {
  return BigInt(Math.max(0, ms - 1_767_225_600_000)) << 22n;
}

/** Exclusive id bounds of a day-based filter: ids greater than `min` and lower than `max`. */
export function dateBounds(key: 'before' | 'after' | 'during', value: string): { min?: string; max?: string } | null {
  const start = startOfDay(value);
  if (start === null) return null;
  if (key === 'before') return { max: snowflakeAt(start).toString() };
  if (key === 'after') return { min: (snowflakeAt(start + DAY_MS) - 1n).toString() };
  return { min: (snowflakeAt(start) - 1n).toString(), max: snowflakeAt(start + DAY_MS).toString() };
}

const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;

/** Turns a parsed query into API parameters, resolving names to ids. */
export function toSearchParams(parsed: ParsedQuery, ctx: SuggestionContext, extra: Pick<SearchParams, 'sort_by' | 'sort_order' | 'offset' | 'limit'> = {}): Resolved {
  const params: SearchParams = { ...extra };
  const problems: string[] = [];
  if (parsed.text) params.content = parsed.text;
  const user = (value: string) => ctx.users.find((u) => same(u.name, value) || u.id === value);
  for (const f of parsed.filters) {
    switch (f.key) {
      case 'from':
      case 'mentions': {
        const found = user(f.value);
        if (!found) problems.push(`No member named "${f.value}"`);
        else (f.key === 'from' ? (params.author_id ??= []) : (params.mentions ??= [])).push(found.id);
        break;
      }
      case 'in': {
        const name = f.value.replace(/^#/, '');
        const found = ctx.channels.find((c) => same(c.name, name) || c.id === name);
        if (!found) problems.push(`No channel named "${name}"`);
        else (params.channel_id ??= []).push(found.id);
        break;
      }
      case 'has':
        if ((HAS_KINDS as readonly string[]).includes(f.value.toLowerCase())) (params.has ??= []).push(f.value.toLowerCase() as HasKind);
        else problems.push(`has: expects ${HAS_KINDS.join(', ')}`);
        break;
      case 'pinned':
        if (f.value === 'true' || f.value === 'false') params.pinned = f.value === 'true';
        else problems.push('pinned: expects true or false');
        break;
      default: {
        const bounds = dateBounds(f.key, f.value);
        if (!bounds) problems.push(`${f.key}: expects a date like 2026-10-31`);
        else {
          if (bounds.min && (!params.min_id || compareSnowflakes(bounds.min, params.min_id) > 0)) params.min_id = bounds.min;
          if (bounds.max && (!params.max_id || compareSnowflakes(bounds.max, params.max_id) < 0)) params.max_id = bounds.max;
        }
      }
    }
  }
  return { params, problems };
}

/** Repeated keys for arrays, as the API expects (`has=image&has=link`). */
export function toQuery(params: SearchParams): Record<string, string | number | boolean | string[] | undefined> {
  return { ...params };
}

// ---- highlighting and local search ------------------------------------------------------------

/** Words worth highlighting: free text without exclusions, quotes and `or`. */
export function highlightTerms(text: string): string[] {
  return [...new Set(text.replace(/"/g, ' ').split(/\s+/).filter((w) => w && !w.startsWith('-') && w.toLowerCase() !== 'or'))];
}

export interface Fragment {
  text: string;
  hit: boolean;
}

export function splitHighlight(content: string, terms: string[]): Fragment[] {
  const escaped = terms.filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (escaped.length === 0) return [{ text: content, hit: false }];
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
  // With one capture group, split puts the matches at the odd indexes.
  return content
    .split(pattern)
    .map((text, i) => ({ text, hit: i % 2 === 1 }))
    .filter((part) => part.text !== '');
}

function hasKinds(message: Message): Set<HasKind> {
  const kinds = new Set<HasKind>();
  if (/https?:\/\//i.test(message.content)) kinds.add('link');
  if (message.embeds.length > 0) kinds.add('embed');
  for (const a of message.attachments) {
    kinds.add('file');
    const type = a.content_type ?? '';
    if (type.startsWith('image/')) kinds.add('image');
    else if (type.startsWith('video/')) kinds.add('video');
    else if (type.startsWith('audio/')) kinds.add('sound');
  }
  return kinds;
}

/** Local matching for Ephemeral and P2P chats, whose messages exist only in the encrypted local store. */
export function matchesLocal(message: Message, params: SearchParams): boolean {
  const lower = message.content.toLowerCase();
  const words = highlightTerms(params.content ?? '').map((w) => w.toLowerCase());
  const excluded = (params.content ?? '').split(/\s+/).filter((w) => w.startsWith('-') && w.length > 1).map((w) => w.slice(1).toLowerCase());
  if (!words.every((w) => lower.includes(w)) || excluded.some((w) => lower.includes(w))) return false;
  if (params.author_id?.length && !params.author_id.includes(message.author.id)) return false;
  if (params.mentions?.length && !params.mentions.every((id) => message.mentions.some((u) => u.id === id))) return false;
  if (params.has?.length) {
    const kinds = hasKinds(message);
    if (!params.has.every((k) => kinds.has(k))) return false;
  }
  if (params.pinned !== undefined && message.pinned !== params.pinned) return false;
  // Local message ids are not snowflakes, so the id bounds are compared as instants.
  const at = Date.parse(message.timestamp);
  if (params.min_id && at <= timestampOf(params.min_id)) return false;
  if (params.max_id && at >= timestampOf(params.max_id)) return false;
  return true;
}
